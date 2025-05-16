<template>
    <span class="tooltip-wrapper" :title="!enabled ? 'Please answer the consent question above' : ''"> 
      <b-button-group class="canvas-btn-group">
        <b-dropdown
          class="button-selector"
          right
          :disabled="!enabled"
          :text="buttonText"
        >
            <b-dropdown-item-button disabled>Choose a supported university</b-dropdown-item-button>
            <b-dropdown-item-button
                v-for="university in universities"
                :key="university.name"
                @click="$emit('select', university)"
            >
                {{ university.name }} 
            </b-dropdown-item-button>      
        </b-dropdown>
      </b-button-group>
    </span>
  </template>
  
<script>
  import 'bootstrap/dist/css/bootstrap.css'
  import 'bootstrap-vue/dist/bootstrap-vue.css'
  import axios from "axios"
  export default {
    name: "CanvasUniversitiesButton",
    props: {
      enabled: {
        type: Boolean,
        default: true
      },
      buttonText: {
        type: String,
        default: "Sign in with Canvas"
      },
    },
    data() {
      return {
        universities: [], // List of Supported Canvas universities
      }
    },
    beforeMount() {
      axios.get("/api/canvas/universities")
        .then(res => {
          this.universities = res.data;
        })
        .catch(err => {
          console.error(`Can't fetch Canvas sign-in universities...`);
        })
    },
    }
</script>
  
<style scoped>
  .canvas-btn-group {
    /* width: 100%;*/
    max-width: 100%;
    align-self: flex-end;
  }
  .button-selector ::v-deep .btn {
    margin-bottom: 5px;
    padding: 10px 15px;
    border: solid 1px #38155a;
    background-color: #4a2270;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
  }
  .button-selector ::v-deep .dropdown-toggle[disabled]{
    cursor: not-allowed !important;
    pointer-events: auto !important; /* allows cursor change */
    opacity: 0.5;
  }
  .button-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    }
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
    align-self: flex-end;
  }
</style>
  