<template>
    <b-button-group class="canvas-split-btn-group">
      <b-button
        class="split-button-button"
        :disabled="!enabled"
        @click="$emit('main-click')"
      >
      <span class=split-button-text>{{ buttonText }}</span>
      </b-button>
      <b-dropdown
        class="split-button-selector"
        right
        no-caret
      >
        <template #button-content>
            <span class="split-button-caret-container">
                <span class="split-button-caret">▼</span>
            </span>
        </template>
        <b-dropdown-item-button disabled>Choose a university</b-dropdown-item-button>
        <b-dropdown-item-button
            v-for="university in universities"
            :key="university.name"
            @click="$emit('select', university)"
        >
            {{ university.name }} 
        </b-dropdown-item-button>      
    </b-dropdown>
    </b-button-group>
  </template>
  
<script>
  import 'bootstrap/dist/css/bootstrap.css'
  import 'bootstrap-vue/dist/bootstrap-vue.css'
  import axios from "axios"
  export default {
    name: "CanvasSplitButton",
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
  .canvas-split-btn-group {
    /* width: 100%;*/
    max-width: 100%;
    align-self: flex-end;
  }
  .split-button-button ::v-deep {
    min-width: 0;
    margin-bottom: 10px;
    padding: 10px 15px;
    border: solid 1px #38155a;
    background-color: #4a2270;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .split-button-selector ::v-deep .btn {
    margin-bottom: 10px;
    padding: 10px 15px;
    border: solid 1px #38155a;
    background-color: #4a2270;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
  }
  .split-button-selector ::v-deep .sr-only,
  .split-button-selector ::v-deep .visually-hidden {
    display: none !important;
  }
  .split-button-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    }
  .split-button-caret {
    font-size: 13px;
  }
  .split-button-caret-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    }
</style>
  