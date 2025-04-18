<template>
  <div class="canvas-course-create">
    <h6> Import a New Class From Canvas </h6>
    <select class="group" v-model="selectedCanvasCourse" required>
      <option disabled value="">Select course</option>
      <option v-for="canvasCourse in canvasCourses" :key="canvasCourse.id" :value="canvasCourse">
        {{ canvasCourse.name }}
      </option>
    </select>
    <button
        :disabled="selectedCanvasCourse === null"
        @click="importCanvasCourse">
      Import
    </button>
  </div>
</template>

<script>
  import axios from "axios"

  export default {
    name: "canvas-course-create",
    data() {
      return {
        newCourse: {
          name: "",
        },
        canvasCourses: [], // List of Canvas courses the user is an instructor for
        selectedCanvasCourse: null, // The selected Canvas course
      }
    },
    props: {
      instructor: {
        type: Array,
        default: () => [],
      },
    },
    methods: {
      pullCanvasCourses: async function() {
        const importedCourses = new Set();
        for (const course of this.instructor) {
          importedCourses.add(course.canvas_id);
        }

        try {
          // Fetch active instructed Canvas courses
          const token = localStorage.getItem("nb.user");
          const headers = { headers: { Authorization: 'Bearer ' + token }};
          const response = await axios.get("/api/classes/canvas", headers);

          // List unimported instructed Canvas courses
          const canvasCourses = [];
          for (const canvasCourse of response.data) {
            if (!importedCourses.has(canvasCourse.id)) {
              canvasCourses.push(canvasCourse);
            }
          }
          this.canvasCourses = canvasCourses;
          this.$emit("canvas-course-create");
        } catch (err) {
          console.log(err);
        }
      },

      importCanvasCourse: async function() {
        this.$isLoading(true);
        try {
          const token = localStorage.getItem("nb.user");
          const headers = { headers: { Authorization: 'Bearer ' + token }};
          const nb_class_res = await axios.post("/api/classes/import", this.selectedCanvasCourse, headers);
          this.selectedCanvasCourse = null;
          localStorage.setItem("nb.current.course",JSON.stringify(nb_class_res.data));
          this.$emit("create-canvas-course");

        } catch (err) {
          console.log(err); //TODO: Deal with this error
          this.$isLoading(false);
        }
      },
    },
    watch: {
      instructor: {
        handler(newInstructor) {
          this.pullCanvasCourses();
        },
        immediate: true
      }
    }
  }
</script>

<style scoped>
  .canvas-course-create {
    display: flex;
    flex-direction: column;
    padding: 0 20px 20px 0;
  }
  .canvas-course-create .group {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    padding: 6px 8px;
    border: solid 1px #aaa;
    border-radius: 5px;
    font-size: 16px;
    flex-grow: 1;
  }
  .canvas-course-create button {
    width: 80px;
    align-self: flex-end;
    padding: 6px 0;
    border-radius: 5px;
    border: solid 1px #38155a;
    background-color: #38155a;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
  }
  .canvas-course-create button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .canvas-course-create button:enabled:hover {
    background-color: #0069d9;
  }
</style>
