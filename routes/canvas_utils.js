const axios = require('axios');
const donenv = require('dotenv');
const cron = require('node-cron');
const User = require('../models').User;
const Class = require('../models').Class;
const Section = require('../models').Section;
const utils = require('../models/utils')(require('../models'));
const { Op } = require("sequelize");

donenv.config();

/**
 * List of Canvas-enabled universities
 * NOTE: This is a static list and should be updated as needed
 */
const canvasUniversities = [
  {
      name: "Massachusetts Institute of Technology", // Name shown on CanvasUniversitiesButton Dropdown
      short_name: "MIT", // Name shown when university selected
      canvas_url: "canvas.mit.edu", // Canvas URL for the university
  },
];

/**
 * List of client secrets for Canvas-enabled universities
 * NOTE: This is a static list and should be updated as needed
 */
const canvasSecrets = {
  "canvas.mit.edu": process.env.MIT_CLIENT_SECRET,
};

/**
 * Retrieves a refreshed Canvas access token for the provided nb user
 *  Returns null if the user hasn't linked their NB account to Canvas
 *  Note: If the user already has active access token, it will be invalidated
*/
async function getCanvasAccessToken(user) {
  if (!user?.canvas_refresh_token) {
    return null;
  }

  const client_id = process.env.VUE_APP_CLIENT_ID;
  const client_secret = process.env.MIT_CLIENT_SECRET;
  try { 
    const refresh_response = await axios.post(
      'https://canvas.mit.edu/login/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: client_id,
        client_secret: client_secret,
        refresh_token: user.canvas_refresh_token,
        expires_in: 3600,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return refresh_response.data.access_token;
  } catch (err) {
    throw new Error("Failed to refresh Canvas access token");
  }
}

/**
 * Retrieves a refreshed Canvas access token for the provided nb user
 *  Additionally sets the access token as a cookie for session access without needing further refresh
 *  Note: If the user already has an active access token, it will be invalidated
 */
async function refreshCanvasAccessToken(user, res) {
    const canvas_access_token = await getCanvasAccessToken(user);
    if (!canvas_access_token) {
        throw new Error("Failed to refresh Canvas access token");
    }
    res.cookie('canvas_access_token', canvas_access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    res.cookie('is_canvas_user', true, {
      httpOnly: false,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    return canvas_access_token;
}

/**
 * Retrieves the profiles and enrollments of all students in the provided Canvas course 
 */
async function getCanvasCourseStudents(canvasAccessToken, canvas_course_id) {
  // Fetch Canvas course sections
  const sections = {};
  const sections_response = await axios.get(`https://canvas.mit.edu/api/v1/courses/${canvas_course_id}/sections`, {
    headers: {
      Authorization: `Bearer ${canvasAccessToken}`
    },
    params: {
      per_page: 100, // TODO: Pagination could be handled here, though likely not needed
    },
  });
  for (const section of sections_response.data) {
    sections[section.id] = section.name;
  }
  
  // Fetch Canvas course students
  const enrollments_response = await axios.get(`https://canvas.mit.edu/api/v1/courses/${canvas_course_id}/enrollments`, {
    headers: {
      Authorization: `Bearer ${canvasAccessToken}`
    },
    params: {
      state: "active",
      per_page: 100, // TODO: Pagination should be handled here
    },
  });

  // Fetch student profiles
  const students = [];
  for (const enrollment of enrollments_response.data) {
    const profile = (await axios.get(`https://canvas.mit.edu/api/v1/users/${enrollment.user.id}/profile`, {
      headers: {
        Authorization: `Bearer ${canvasAccessToken}`
      },
      params: {}
    })).data;
    students.push({
      canvas_id: profile.id,
      enrollment_type: enrollment.type,
      section: `${sections[enrollment.course_section_id]}`,
      profile: profile,
    });
  }

  return students;
}

/* 
  Adds the Canvas student to the provided NB class
    If the canvas_student doesn't already exist on NB, a new user is created
    If nb_student is provided, it is the one added to the nb class 
*/
const addCanvasStudentToNbClass = async (nb_class, canvas_student, nb_student=null) => {
  const profile = canvas_student.profile;
  const role = canvas_student.enrollment_type;
  const section = canvas_student.section;

  // Get student NB profile (if exists)
  if (nb_student == null) {
    nb_student = await User.findOne({ where: { canvas_user_id: { [Op.iLike]: `${profile.id}` } } });
  }
  if (nb_student == null) {
    nb_student = await User.findOne({ where: { username: { [Op.iLike]: profile.login_id.split('@')[0] } } });
  }

  // If user doesn't already exist -> register them first
  if (nb_student == null) { 
    try {
      nb_student = await User.create({
        username: profile.login_id.split('@')[0],
        first_name: profile.sortable_name.split(', ')[1],
        last_name: profile.sortable_name.split(', ')[0],
        email: profile.primary_email.toLowerCase(),
        password: "",
        canvas_user_id: profile.id,
      });
    } catch (err) {
      return;
    } // Canvas user most likely already exists
  }

  if (role === "TeacherEnrollment") {
    await nb_class.addInstructor(nb_student);
  }
  else if (role === "TaEnrollment") {
    await nb_class.addClassTAs(nb_student);
  }
  else if (role === "StudentEnrollment") {
    if (section) {
      utils.addStudentToSection(nb_class, nb_student, section);
    } else {
      utils.addStudent(nb_class.id, nb_student.id);
    }
  }
  else {
    console.log(`Error: Import student not added: ${profile} with role ${role}`);
  }
}

/**
 * Resync the NB roster of the provided Canvas imported class.
 * Resyncing includes:
 * - Adding students from the Canvas class who aren't in the NB class
 * - Removing students from the NB class who aren't in the Canvas class
 * - Updating section mismatches of students in the NB class to match their Canvas section
*/
async function resyncCanvasCourse(nb_course) {
  // Retrieve canvas_access_token from course instructor
  let canvas_access_token;
  for (const instructor of nb_course.Instructors) {
    if (instructor.canvas_refresh_token) {
      canvas_access_token = await getCanvasAccessToken(instructor);
    }
  }
  if (!canvas_access_token) { // If no token found, can't resync
    return; 
  }

  // Retrieve nb and Canvas course rosters
  let canvas_students;
  let nb_students;
  try {
    canvas_students = await getCanvasCourseStudents(canvas_access_token, nb_course.canvas_id);
    nb_students = await Class.findByPk(nb_course.id, {
      include: [
        { 
          model: User, 
          as: 'Instructors' 
        },
        { 
          model: User, 
          as: 'ClassTAs' 
        },
        { 
          model: Section, 
          as: 'Sections',
          include: [{
            model: User,
            as: 'MemberStudents', 
            through: { attributes: [] } 
          }]
        }
      ]
    });
  } catch (err) {
    throw new Error("Resync failed: Invalid nb course id or missing Canvas course id");
  }
  if (canvas_students === undefined || nb_students === undefined) {
    throw new Error("Resync failed: Invalid nb course id or missing Canvas course id");
  }

  // Process nb rosters for easy checking
  const nb_userNameToStudent = new Map();
  const nb_canvasUserIdToStudent = new Map();
  for (const section of nb_students.Sections) {
    for (const student of section.MemberStudents) {
      student.section = section.section_name;
      nb_userNameToStudent.set(student.username, student);
      nb_canvasUserIdToStudent.set(student.canvas_user_id, student);
    }
  }
  for (const classTA of nb_students.ClassTAs) {
      classTA.section = "TA";
      nb_userNameToStudent.set(classTA.username, classTA);
      nb_canvasUserIdToStudent.set(classTA.canvas_user_id, classTA);
  }
  for (const instructor of nb_students.Instructors) {
      instructor.section = "Instructor";
      nb_userNameToStudent.set(instructor.username, instructor);
      nb_canvasUserIdToStudent.set(instructor.canvas_user_id, instructor);
  }

  // Process canvas rosters for easy checking
  const canvas_usernameToSection = new Map();
  for (const student of canvas_students) {
    canvas_usernameToSection.set(student.profile.login_id.split('@')[0], student.section);
  }
  const canvas_canvasUserIdToSection = new Map();
  for (const student of canvas_students) {
    canvas_canvasUserIdToSection.set(student.canvas_id, student.section);
  }

  // Check for student adds and section changes
  for (const canvas_student of canvas_students) {
    const canvas_username = canvas_student.profile.login_id.split('@')[0];
    const canvas_user_id = canvas_student.canvas_id;

    // If Canvas student not on NB roster, add them
    if (!nb_userNameToStudent.has(canvas_username) && !nb_canvasUserIdToStudent.has(canvas_user_id)) {
      try {
        await addCanvasStudentToNbClass(nb_course, canvas_student);
      } catch (err) { // TODO: What happens if a student unlinks from Canvas and changes their username
        console.log("Error adding added student to NB class: ", err);
      }
    }

    // If student is already on NB roster, check if they have the correct section and role
    else {
      const nb_student = nb_userNameToStudent.get(canvas_username) || nb_canvasUserIdToStudent.get(canvas_user_id);
      const nb_section = nb_student.section;

      // If NB instructor switched to different role on Canvas, perform update
      if (nb_section == "Instructor") {
        if (canvas_student.enrollment_type != "TeacherEnrollment" && (canvas_student.enrollment_type == "TaEnrollment" || canvas_student.enrollment_type == "StudentEnrollment")) {
          try {
            await nb_course.removeInstructor(nb_student);
            await addCanvasStudentToNbClass(nb_course, canvas_student, nb_student);
          } catch (err) {
            console.log("Error switching Instructor to other role: ", err);
          }
        }
      }
      // If NB TA switched to different role on Canvas, perform update
      else if (nb_section == "TA") {
        if (canvas_student.enrollment_type != "TaEnrollment" && (canvas_student.enrollment_type == "TaEnrollment" || canvas_student.enrollment_type == "StudentEnrollment")){
          try {
            await nb_course.removeClassTAs(nb_student);
            await addCanvasStudentToNbClass(nb_course, canvas_student, nb_student);
          } catch (err) {
            console.log("Error switching TA to other role: ", err);
          } 
        }
      }
      // If NB student promoted to TA/instructor role, perform update
      else if (canvas_student.enrollment_type == "TeacherEnrollment" || canvas_student.enrollment_type == "TaEnrollment") {
        try {
          await utils.removeStudent(nb_course.id, nb_student.id);
          await addCanvasStudentToNbClass(nb_course, canvas_student, nb_student);
        } catch (err) {
          console.log("Error switching student to TA/instructor role: ", err);
        }
      } 
      // If NB student switched to different section or role on Canvas, perform update
      else if (nb_section != canvas_student.section && canvas_student.enrollment_type == "StudentEnrollment") {
        try {
          await utils.addStudentToSection(nb_course, nb_student, canvas_student.section);
        } catch (err) {
          console.log("Error switching student to other section: ", err);
        } 
      }
      // TODO: What do you do for enrollments that are not Teacher, TA, or Student
      else if (canvas_student.enrollment_type != "StudentEnrollment") {
        console.log ("Error: Received student of enrollment type:", canvas_student.enrollment_type);
      }
    }
  }

  // Check for student drops
  for (const nb_student of nb_students.Sections[0].MemberStudents) { // assumes all students in global section
    if (!canvas_usernameToSection.has(nb_student.username) && !canvas_canvasUserIdToSection.has(nb_student.canvas_user_id)) {
      try {
        await utils.removeStudent(nb_course.id, nb_student.id);
      } catch (err) {
        console.log("Error removing dropped student from NB class: ", err);
      } 
    }
  }

  // Check for TA drops
  for (const nb_classTA of nb_students.ClassTAs) {
    if (!canvas_usernameToSection.has(nb_classTA.username) && !canvas_canvasUserIdToSection.has(nb_classTA.canvas_user_id)) {
      try {
        await nb_course.removeClassTAs(nb_classTA);
      } catch (err) {
        console.log("Error removing dropped TA from NB class: ", err);
      } 
    }
  }

  // Check for instructor drops
  for (const instructor of nb_students.Instructors) {
    // If NB instructor not on Canvas roster, remove them
    if (!canvas_usernameToSection.has(instructor.username) && !canvas_canvasUserIdToSection.has(instructor.canvas_user_id)) {
      try {
        await nb_course.removeInstructor(instructor);
      } catch (err) {
        console.log("Error removing dropped instructor from NB class: ", err);
      } 
    }
  }
}

/**
 * Resync the NB roster of all Canvas imported classes.
*/
async function resyncAllCanvasCourses(print_progress=false) {
  console.log("Starting mass resync...");

  // Retrieve all classes
  let nb_courses;
  try {
    if(print_progress){
      console.log("Fetching all courses...");
    }
    nb_courses = await Class.findAll({
      include: [
        { association: 'GlobalSection' },
        {
          model: User,
          as: 'Instructors' 
        },
      ] 
    });
    if (print_progress){
      console.log(`Successfully fetched ${nb_courses.length} courses`);
    }
  } catch (err) {
    console.log(`Fetching all courses failed with error: `, err);
  }

  // Resync each Canvas imported class
  for (const nb_course of nb_courses) {
    if (nb_course.canvas_id) {
      if (print_progress) {
      console.log(`Starting resync of Canvas imported course: (${nb_course.class_name}, ${nb_course.id})`);
      }
      try{
        await resyncCanvasCourse(nb_course);
        if (print_progress){
          console.log(`Resync of (${nb_course.class_name}, ${nb_course.id}) complete successfully`);
        }
      } catch (err) {
        console.log(`Resync of (${nb_course.class_name}, ${nb_course.id}) failed with err: `, err);
      }
    }
  }

  console.log("Mass resync finished successfully");
}

// Schedule mass resync every day at midnight (server time)
//   Change print_progress to true to enable progress logging
cron.schedule('0 0 * * *', () => {resyncAllCanvasCourses(false)}); 

module.exports = {addCanvasStudentToNbClass, canvasUniversities, canvasSecrets, getCanvasCourseStudents, refreshCanvasAccessToken, resyncCanvasCourse};
