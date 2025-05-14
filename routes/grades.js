const express = require('express');
const Class = require('../models').Class;
const User = require('../models').User;
const Source = require('../models').Source;
const Annotation = require('../models').Annotation;
const GradingSystem = require('../models').GradingSystem;
const GradingThreshold = require('../models').GradingThreshold;
const CriteriaCount = require('../models').CriteriaCount;
const Criteria = require('../models').Criteria;
const Assignment = require('../models').Assignment;
const router = express.Router();
const h2p = require('html2plaintext');
const {refreshCanvasAccessToken} = require("./canvas_utils");
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');
const axios = require('axios');

/**
 * Get grading systems of a class.
 * @name GET/api/grades/gradingSystems
 */
router.get('/gradingSystems', (req, res) => {
  if (!req.query.classId){
    res.status(200).json(null);
    return null;
  }
  Class.findByPk(req.query.classId,{include: [{
      association: 'GradingSystems',
      include: [{
        association: 'GradingThresholds',
        include: [{
          association: 'CriteriaCounts',
          attributes: ['id','num_annotations', 'criteria_id']
        }],
        order: [
          [GradingThreshold, 'score', 'DESC']
        ]
      },
      {association: 'Criteria'}
    ]
    }]
  }).then((nb_class) => {
    res.status(200).json(nb_class.GradingSystems);
  });
});


/**
 * Set grading threshold of a class.
 * @name POST/api/grades/gradingSystems
 * @param id: id of grading system to add threshold to
 */
router.post('/threshold/:id', (req, res) => {
  GradingThreshold.create({
    label: req.body.label,
    score: req.body.points,
    total_comments: req.body.totalComments,
    total_words: req.body.totalWords,
    total_tags: req.body.totalHashtags,
    total_chars: req.body.totalChars,
    grading_system_id: req.params.id,
    CriteriaCounts: Object.keys(req.body.customCriteria).map(id => {
      return {
        criteria_id: id,
        num_annotations: req.body.customCriteria[id]
      };
    })
  },{
    include:[{association: 'CriteriaCounts'}]
  })
  .then(threshold => {
    res.status(200).json(threshold);
  });
});

/**
 * Edit grading threshold of a class.
 * @name GET/api/grades/gradingSystems
 * @param id: id of grading threshold
 */
router.put('/threshold/:id', (req, res) => {
  GradingThreshold.findByPk(req.params.id).then(threshold =>
    threshold.update({
      label: req.body.label,
      score: req.body.points,
      total_comments: req.body.totalComments,
      total_words: req.body.totalWords,
      total_tags: req.body.totalHashtags,
      total_chars: req.body.totalChars,
    }))
    .then(threshold =>
      Object.keys(req.body.customCriteria).map(id => {
        CriteriaCount.findOne({where: {
          criteria_id: id,
          grading_threshold_id: threshold.id
        }})
        .then(criteriaCount => {
          if(criteriaCount){
            return criteriaCount.update({
              num_annotations: req.body.customCriteria[id]
            });
          }
          else{
            return CriteriaCount.create({
              criteria_id: id,
              grading_threshold_id: threshold.id,
              num_annotations: req.body.customCriteria[id]
            });
          }
        });
      })
  )
  .then(() => {
    res.status(200).json(null);
  });
});


/**
 * Delete grading threshold of a class.
 * @name DELETE/api/grades/threshold
 * @param id: id of grading threshold
 */
router.delete('/threshold/:id', (req, res) => {
  GradingThreshold.destroy({where:{id: req.params.id}})
  .then(() => {
    res.status(200).json(null);
  });
});

/**
 * Create custom criteria for a grading system
 * @name POST/api/grades/criteria/:id
 * @param id: id of grading system
 */
router.post('/criteria/:id', (req, res) => {
  Criteria.create({
    label: req.body.label,
    num_tags: req.body.filters.HASHTAGS,
    num_words: req.body.filters.WORDS,
    num_chars: req.body.filters.CHARS,
    grading_system_id: req.params.id
  })
  .then(criteria => res.status(200).json(criteria))
});

/**
 * Edit custom criteria for a grading system
 * @name PUT/api/grades/criteria/:id
 * @param id: id of criteria
 */
router.put('/criteria/:id', (req, res) => {
  Criteria.findByPk(req.params.id).then(criteria =>
    criteria.update({
      label: req.body.label,
      num_tags: req.body.filters.HASHTAGS,
      num_words: req.body.filters.WORDS,
      num_chars: req.body.filters.CHARS
    }))
  .then(criteria => res.status(200).json(criteria))
});

/**
 * Delete custom criteria for a grading system
 * @name DELETE/api/grades/criteria/:id
 * @param id: id of criteria
 */
router.delete('/criteria/:id', (req, res) => {
  Criteria.destroy({where:{id: req.params.id}})
    .then(() => res.status(200).json(null));
});

/**
 * Generate grades for all students in current class for a given source and grading scheme
 * @name GET/api/grades/grades
 * @param sourceId: id of source file
 * @param gradingSystemId: id of gradingSystem
 */
router.get('/grades', (req, res) => {
  Class.findByPk(req.query.classId, {include:
    [{
      association: 'GlobalSection',
      include:[{
        association: 'MemberStudents',
        include:[{
          association: 'Annotations',
          // TODO: fix in query, temp measure is in filtering below
          // where: { createdAt: {$lt : new Date(req.query.date)}},
          // required: false,
          include:[{
            association: 'Thread',
            required: true,
            include: [{
              association: 'Location',
              required: true,
              include: [{
                association: 'Source',
                where:{id: req.query.sourceId},
                required: true,
              }],
            }]
          },
          {association: 'Tags'}
          ]
        }]
      }]
    }]
}).then(nb_class => {
  // Source.findByPk(req.query.sourceId,{include: [{association: 'Assignment'}]}).then(source =>{
  //   if(source.Assignment){
  //     source.Assignment.update({deadline: new Date(req.query.date)});
  //   }
  //   else{
  //     Assignment.create({deadline: new Date(req.query.date), source_id: source.id});
  //   }
  // })
  GradingSystem.findByPk(req.query.gradingSystemId, {include:
    [
      {association: 'Criteria'},
      {association: 'GradingThresholds',
        include:[{association: 'CriteriaCounts'}]
      }
    ]})
    .then(gradingSystem => {
      let grades = [];
      let annotations = {};
      let filters = {};
      let date = new Date(req.query.date);
      let students = nb_class.GlobalSection.MemberStudents.map(student => {
        annotations[student.id] = student.Annotations.filter(annotation =>
          req.query.date && annotation.get({plain:true}).createdAt < date
        );
        return student.get({plain: true});
      });
      nb_class.GlobalSection.MemberStudents.forEach(student => {
        annotations[student.id] = annotations[student.id].map(annotation => {
          let text = h2p(annotation.content);
          return {
            words : text.split(" ").length,
            chars : text.length,
            tags : annotation.Tags.length
          };
        });
      });

      gradingSystem.Criteria.forEach(criteria => {
        filters[criteria.id] = function(annotation){
          return annotation.words >= criteria.num_words &&
            annotation.chars >= criteria.num_chars &&
            annotation.tags >= criteria.num_tags;
        };
      });
      students.forEach(student => {
        let gradeLine = {
          username: student.username,
          email: student.email,
          name: `${student.first_name} ${student.last_name}`,
          total_words: annotations[student.id].reduce((sum, annotation) => (sum + annotation.words), 0),
          total_chars: annotations[student.id].reduce((sum, annotation) => (sum + annotation.chars), 0),
          total_tags: annotations[student.id].reduce((sum, annotation) => (sum + annotation.tags), 0),
          total_comments: annotations[student.id].length,
        };
        let possibleGrades = gradingSystem.GradingThresholds.filter(threshold =>
            gradeLine.total_words >= threshold.total_words &&
            gradeLine.total_chars >= threshold.total_chars &&
            gradeLine.total_tags >= threshold.total_tags &&
            gradeLine.total_comments >= threshold.total_comments &&
            //Go through all the criteria counts and see if satisfying annotations are enough
            (threshold.CriteriaCounts.reduce((bool, criteriaCount) =>
              (bool &&
                (criteriaCount.num_annotations == 0 ||
                  annotations[student.id]
                  .filter(filters[criteriaCount.criteria_id]).length >= criteriaCount.num_annotations)),
              true))
        );
        gradeLine.grade = possibleGrades.reduce((max, t) => t.score > max ? t.score : max, 0);
        grades.push(gradeLine);
      });
      res.status(200).json(grades);
    });
});

});

/**
 * Generate grades for all students in current class for all sources and grading scheme
 * @name GET/api/grades/all
 * @param gradingSystemId: id of gradingSystem
 */
 router.get('/all', (req, res) => {
  Class.findByPk(req.query.classId, {include:
    [{
      association: 'GlobalSection',
      include:[{
        association: 'MemberStudents',
        include:[{
          association: 'Annotations',
          // TODO: fix in query, temp measure is in filtering below
          // where: { createdAt: {$lt : new Date(req.query.date)}},
          // required: false,
          include:[{
            association: 'Thread',
            required: true,
            include: [{
              association: 'Location',
              required: true,
              include: [{
                association: 'Source',
                required: true,
              }],
            }]
          },
          {association: 'Tags'}
          ]
        }]
      }]
    }]
}).then(nb_class => {
  // Source.findByPk(req.query.sourceId,{include: [{association: 'Assignment'}]}).then(source =>{
  //   if(source.Assignment){
  //     source.Assignment.update({deadline: new Date(req.query.date)});
  //   }
  //   else{
  //     Assignment.create({deadline: new Date(req.query.date), source_id: source.id});
  //   }
  // })
  GradingSystem.findByPk(req.query.gradingSystemId, {include:
    [
      {association: 'Criteria'},
      {association: 'GradingThresholds',
        include:[{association: 'CriteriaCounts'}]
      }
    ]})
    .then(gradingSystem => {
      let grades = [];
      let annotations = {};
      let filters = {};
      let date = new Date(req.query.date);
      let students = nb_class.GlobalSection.MemberStudents.map(student => {
        annotations[student.id] = student.Annotations.filter(annotation =>
          req.query.date && annotation.get({plain:true}).createdAt < date
        );
        return student.get({plain: true});
      });
      nb_class.GlobalSection.MemberStudents.forEach(student => {
        annotations[student.id] = annotations[student.id].map(annotation => {
          let text = h2p(annotation.content);
          return {
            words : text.split(" ").length,
            chars : text.length,
            tags : annotation.Tags.length
          };
        });
      });

      gradingSystem.Criteria.forEach(criteria => {
        filters[criteria.id] = function(annotation){
          return annotation.words >= criteria.num_words &&
            annotation.chars >= criteria.num_chars &&
            annotation.tags >= criteria.num_tags;
        };
      });
      students.forEach(student => {
        let gradeLine = {
          username: student.username,
          email: student.email,
          name: `${student.first_name} ${student.last_name}`,
          total_words: annotations[student.id].reduce((sum, annotation) => (sum + annotation.words), 0),
          total_chars: annotations[student.id].reduce((sum, annotation) => (sum + annotation.chars), 0),
          total_tags: annotations[student.id].reduce((sum, annotation) => (sum + annotation.tags), 0),
          total_comments: annotations[student.id].length,
        };
        let possibleGrades = gradingSystem.GradingThresholds.filter(threshold =>
            gradeLine.total_words >= threshold.total_words &&
            gradeLine.total_chars >= threshold.total_chars &&
            gradeLine.total_tags >= threshold.total_tags &&
            gradeLine.total_comments >= threshold.total_comments &&
            //Go through all the criteria counts and see if satisfying annotations are enough
            (threshold.CriteriaCounts.reduce((bool, criteriaCount) =>
              (bool &&
                (criteriaCount.num_annotations == 0 ||
                  annotations[student.id]
                  .filter(filters[criteriaCount.criteria_id]).length >= criteriaCount.num_annotations)),
              true))
        );
        gradeLine.grade = possibleGrades.reduce((max, t) => t.score > max ? t.score : max, 0);
        grades.push(gradeLine);
      });
      res.status(200).json(grades);
    });
});

});

/**
 * Upload NB course grades to the instructor's chosen Canvas assignment
 * @name POST/api/grades/upload
 * @param canvas_course_id: Canvas course_id of the Canvas-imported NB course
 * @param assignment_id: Chosen Canvas assignment_id to submit grades to
 * @param grades: Array of student grade objects to upload
 */
router.post('/upload', async (req, res) => {
  // Verify params
  const canvas_course_id = req.body.canvas_course_id;
  const assignment_id = req.body.assignment_id;
  let grades = req.body.grades;
  if (!canvas_course_id) {
    return res.status(400).json({ msg: "bad canvas_course_id" });
  } 
  else if (!assignment_id) {
    return res.status(400).json({ msg: "bad assignment_id" });
  } 
  else if (!grades) {
    return res.status(400).json({ msg: "bad grades" });
  }
  grades = grades.filter(grade => grade["Email"] && grade["Grade"]);

  // Retrieve user's Canvas access token from cookie
  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(401).json({ msg: "Cannot find user"});
  }
  if (!user.canvas_refresh_token) {
    return res.status(401).json({ msg: 'Error: Missing Canvas access token' });
  }
  const canvasAccessToken = await refreshCanvasAccessToken(user, res);
  if (!canvasAccessToken) {
    return res.status(401).json({ msg: 'Error: Missing Canvas access token' });
  }

  // Retrieve canvas_user_ids for all students with grades
  const emails = grades.map(grade => grade["Email"].toLowerCase());
  let students = [];
  try {
    students = await User.findAll({
      where: { email: { [Op.iLike]: { [Op.any]: emails } } }
    });
  } catch (error) {
    console.error('Error retrieving students from database:', error);
  }
  const studentEmailToCanvasUserId = new Map();
  students.forEach(student => {
    if (student.canvas_user_id) {
      studentEmailToCanvasUserId.set(student.email.toLowerCase(), student.canvas_user_id);
    }
  });

  // Build grade_data to upload
  // Note: Students that don't have their NB account linked to Canvas won't be included in grade_data
  //      and will be returned in ungraded_students
  const grade_data = {};
  const ungraded_students = [];
  for (const grade of grades) {
    const email = grade["Email"].toLowerCase();
    const canvas_user_id = studentEmailToCanvasUserId.get(email);
    if (!canvas_user_id) {
      ungraded_students.push({
        email: email,
        name: grade["Name"],
        grade: grade["Grade"],
      });
    } 
    else {
      grade_data[canvas_user_id] = {
        posted_grade: grade["Grade"],
        //posted_grade: `${(parseFloat(grade["Grade"])/4)*100}%`, // Express grade as a percentage out of 4 points
      }
    }
  };

  // Upload grades to Canvas
  if (Object.keys(grade_data).length != 0) {
    try {
      // Build form data
      const formData = new URLSearchParams();
      for (const [canvas_user_id, grade] of Object.entries(grade_data)) {
        formData.append(`grade_data[${canvas_user_id}][posted_grade]`, grade.posted_grade);
      }
      
      // Submit grade update
      await axios.post(
        `https://canvas.mit.edu/api/v1/courses/${canvas_course_id}/assignments/${assignment_id}/submissions/update_grades`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${canvasAccessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch (error) {
      console.error('Error uploading grades to Canvas:', error);
      return res.status(500).json({ msg: 'Error uploading grades to Canvas' });
    }
  }
  
  res.status(200).json(ungraded_students);
});


module.exports = router;
