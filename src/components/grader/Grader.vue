<template>
  <div class="grader">
    <grade-table
        v-if="selectedGrading !== null"
        :gradingSystem="gradingSystems[selectedGrading]">
    </grade-table>

    <div class="settings first">
      <div class="group">
        <span class="label"> Grading System: </span>
        <select v-model="selectedGrading">
          <option
              v-for="(gradingSystem, index) in gradingSystems"
              :key="index"
              :value="index">
            {{gradingSystem.grading_system_name}}
          </option>
        </select>
      </div>
      <div class="group">
        <span class="label"> Document: </span>
        <select v-model="selectedSource">
          <option
              v-for="(source, index) in sources"
              :key="index"
              :value="index">
            {{source.filename}}
          </option>
        </select>
      </div>
      <div class="group">
        <span class="label"> Deadline: </span>
        <datepicker v-model="date" :bootstrap-styling="true"></datepicker>
      </div>
      <div class="buttons">
        <button :disabled="!submitEnabled || isGeneratingGrades" @click="generateGrades">
          {{isGeneratingGrades ? 'Generating...' : 'Generate Grades'}}
        </button>
        <button :disabled="!downloadGradesEnabled || isGeneratingGrades" @click="downloadGrades">
          Download Grades
        </button>
      </div>
    </div>
    <div v-if="canvasEnabled" class="settings">
      <div class="group">
        <span class="label"> Canvas Assignment: </span>
        <v-select
              :options="assignments"
              :reduce="assignment => assignment.value"
              v-model="selectedAssignment"
              placeholder=""
              :clearable="true"
              class="v-select-custom"
        ></v-select>  
      </div>   
      <div class="buttons">
          <button :disabled="!uploadGradesEnabled || isGeneratingGrades" @click="uploadGrades">
            Upload Grades
          </button> 
      </div>
    </div>
    <hr>
    <CsvGradeTable :gradesCsvString="gradesCsvString" />

  </div>
</template>

<script>
  import axios from 'axios'
  import Papa from 'papaparse';
  import Vue from 'vue'
  import VTooltip from 'v-tooltip'
  import VModal from 'vue-js-modal'
  import Datepicker from 'vuejs-datepicker';
  import { jwtDecode } from 'jwt-decode';
  import vSelect from 'vue-select'
  import 'vue-select/dist/vue-select.css'

  Vue.use(VTooltip)
  Vue.use(VModal)

  import GradeTable from './GradeTable.vue'
  import CsvGradeTable from './CsvGradeTable.vue'

  export default {
    name: 'Grader',
    props: {
      course: Object
    },
    data() {
      return {
        gradesCsvString: "",
        assignments: [],
        ungradedUsers: [],
        selectedAssignment: null,
        gradingSystems: [],
        sources: [],
        selectedGrading: null,
        selectedSource: null,
        isGeneratingGrades: false,
        date: new Date() // TODO: default to the assignment due date instead
      }
    },
    computed: {
      submitEnabled: function() {
        return this.selectedGrading !== null && this.selectedSource !== null;
      },
      downloadGradesEnabled: function() {
        return this.gradesCsvString !== "";
      },
      canvasEnabled: function() {
        return this.course.canvas_id;
      },
      uploadGradesEnabled: function() {
        return this.downloadGradesEnabled && this.selectedAssignment !== null;
      }
    },
    created: function() {
        try {
            const token = localStorage.getItem("nb.user");
            if (token) {
                const decoded = jwtDecode(token);
                if (!(decoded.user.username !== undefined && decoded.user.username !== "")) {
                    this.$router.push('/')
                }   
            }
        } catch (error) {
            this.$router.push('/')
            console.log(error, 'error from decoding token')
        }
    },
    mounted: function() {
      const token = localStorage.getItem("nb.user");
      const config = { 
          headers: { Authorization: 'Bearer ' + token },
          params: { 
            classId: this.course.id, 
            canvasCourseId: this.course.canvas_id,
          }
      }
      axios.get('/api/grades/gradingSystems', config).then(res => {
        this.gradingSystems = res.data
        if (this.gradingSystems.length > 0) {
          this.selectedGrading = 0 // defaults to the first one
        }
      })
      axios.get('/api/classes/sourceList', config).then(res => {
        this.sources = res.data
        if (this.sources.length > 0) {
          const source = { filename: 'All', id: 'OVERALL'}
          this.sources.unshift(source)
          this.selectedSource = 0 // defaults to the first one
        }
      })
      
      if (this.course.canvas_id) {
        axios.get('/api/classes/assignments', config).then(res => {
          const assignments = res.data;
          this.assignments = assignments.map(assignment => ({
            value: assignment.id,
            label: assignment.name
          }))
        });
      }
    },
    methods: {
      generateGrades: async function() {
        this.isGeneratingGrades = true
        const url = this.sources[this.selectedSource].id === 'OVERALL' ? '/api/grades/all' : '/api/grades/grades' 
        const token = localStorage.getItem("nb.user");
        const course = JSON.parse(localStorage.getItem('nb.current.course'))
        const config = { 
            headers: { Authorization: 'Bearer ' + token }, 
            params:{
                gradingSystemId: this.gradingSystems[this.selectedGrading].id,
                sourceId: this.sources[this.selectedSource].id,
                date: this.date,
                classId: course.id
            }
        }
        try{
          const res = await axios.get(url, config);
          var csv = 'Name,Email,Username,Total Comments,Total Words,Total Characters,Total Tags,Grade\n';
          res.data.forEach(function(row) {
            csv += row.name+",";
            csv += row.email+",";
            csv += row.username+",";
            csv += row.total_comments+",";
            csv += row.total_words+",";
            csv += row.total_chars+",";
            csv += row.total_tags+",";
            csv += row.grade+"\n"
          });
          this.gradesCsvString = csv;
          this.isGeneratingGrades = false;
        } catch(err) {
          console.log("Error generating grades...");
        }
      },
      downloadGrades: function() {
        let hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(this.gradesCsvString);
        hiddenElement.target = '_blank';
        hiddenElement.download = 'grades.csv';
        hiddenElement.click();
      },
      uploadGrades: async function() {
        this.$isLoading(true);
        const token = localStorage.getItem("nb.user");
        const headers = { 
            headers: { Authorization: 'Bearer ' + token },
        }
        const data = {
          canvas_course_id: this.course.canvas_id,
          assignment_id: this.selectedAssignment,
          grades: Papa.parse(this.gradesCsvString, {header: true}).data
        }

        let ungradedStudents
        try{
          ungradedStudents = (await axios.post('/api/grades/upload', data, headers)).data;
        } catch(err) {
          console.log("Error uploading grades to Canvas...");
        }
        this.ungradedStudents = ungradedStudents;

        // TODO: Display these ungraded students in a table

        this.$isLoading(false);
      },
    },
    components: {
      CsvGradeTable,
      Datepicker,
      GradeTable,
      'v-select': vSelect,
    }
  }
</script>

<style scoped>
  .buttons {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
  }
  .grader {
    padding-top: 20px;
  }
  .settings.first {
    margin-top: 20px;
  }
  .settings {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .settings .group {
    margin-right: 10px;
    display: flex;
    gap: 5px;
    align-items: center;
  }
  .settings .group select {
    font-size: 16px;
  }
  .vdp-datepicker {
    display: inline-block;
  }
  .vdp-datepicker .vdp-datepicker__calendar {
    bottom: 0;
    right: 0;
  }
  .settings button {
    padding: 6px 8px;
    border-radius: 5px;
    border: solid 1px #38155a;
    background-color: #38155a;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
  }
  .settings button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .settings button:enabled:hover {
    background-color: #0069d9;
  }
  .v-select.v-select-custom {
  min-width: 180px;
  font-size: 16px;
  }
  ::v-deep(.vs__dropdown-menu) {
  max-height: 200px;
  overflow-y: auto;
}

</style>
