<template>
  <div class="grade-table">
    <div class="table-wrapper">
      <table v-if="rows.length">
        <thead>
          <tr>
            <th v-for="header in headers" :key="header">{{ header }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rIdx) in rows" :key="rIdx">
            <td v-for="header in headers" :key="header">{{ row[header] }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else>
        <!-- Currently nothing is shown if no grades are generated -->
      </div>
    </div>
  </div>
</template>

<script>
import Papa from 'papaparse';

export default {
  name: 'CsvGradeTable',
  props: {
    gradesCsvString: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      headers: [],
      rows: []
    }
  },
  watch: {
    gradesCsvString: {
      immediate: true,
      handler(newVal) {
        if (newVal) {
          const parsed = Papa.parse(newVal, { header: true });
          this.headers = parsed.meta.fields || [];
          this.rows = parsed.data.filter(row => Object.values(row).some(val => val !== ''));
        } else {
          this.headers = [];
          this.rows = [];
        }
      }
    }
  }
}
</script>

<style scoped>
.table-wrapper {
  max-width: 100%;
}
table, table td {
  padding: 8px;
  text-align: center;
  border: solid 1px #666;
}
table td, table th {
  width: 100px;
}
table tr:nth-child(even) {
  background-color: #f0f0f0;
}
table tr:hover {
  background-color: #ffffd0;
}
</style>
