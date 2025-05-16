<template>
  <div class="form">
    <h3 class="title">Sign in</h3>
    <CanvasUniversitiesButton
      :enabled="true"
      :buttonText=buttonText
      @select="onSelectUniversity"
    />

    <div v-if="canvas_message" class="message">{{ canvas_message }}</div>
    
    <div class="separator">
      <span class="separator-text">or</span>
    </div>

    <div class="group">
      <label for="login-username"> Username: </label>
      <input id="login-username" type="text" v-model="user.username">
    </div>

    <div class="group">
      <label for="login-password"> Password: </label>
      <input id="login-password" type="password" v-model="user.password" v-on:keyup.enter="login">
    </div>

    <div v-if="message" class="message">{{ message }}</div>

    <span class="tooltip-wrapper" :title="!submitEnabled ? 'Please enter username and password' : ''">
      <button class="submit" :disabled="!submitEnabled" @click="login">
        Sign in
      </button>
    </span>

    <div class="separator before-reset" />
    
    <h3 class="title">Reset Your Password</h3>
    <div class="group">
      <label for="login-email"> Email: </label>
      <input id="login-email" type="text" v-model="user.email">
    </div>
    <span class="tooltip-wrapper" :title="!forgotPasswordEnabled ? 'Please enter email' : ''">
      <button class="submit" :disabled="!forgotPasswordEnabled" @click="forgotPassword">Forgot Password</button>
    </span>
    <span class="forgot-password-message"><br>{{forgotPasswordMessage}}<br></span>

  </div>
</template>

<script>
  import axios from "axios"
  import Vue from 'vue'
  import loading from 'vuejs-loading-screen'
  import CanvasUniversitiesButton from './CanvasUniversitiesButton.vue'
  import { eventBus } from "../../main"

  Vue.use(loading, {
    bg: '#4a2270ad',
    icon: 'refresh',
    size: 3,
    icon_color: 'white',
  })

  export default {
    name: "user-login",
    components: { CanvasUniversitiesButton },
    data() {
      return {
        selectedUniversity: null,
        user: {
          username: "",
          password: "",
          email: "",
        },
        forgotPasswordMessage: "",
        message: null,
        canvas_message: null,
      }
    },
    computed: {
      submitEnabled: function() {
        return this.user.username.length > 0 && this.user.password.length > 0
      },
      forgotPasswordEnabled: function() {
        return this.user.email && this.user.email.length > 0
      },
      buttonText: function() {
        return this.selectedUniversity != null ? `Sign in with \n${this.selectedUniversity.short_name} Canvas` : "Sign in with Canvas"
      },
    },
    methods: {
        login: async function() {
            try {
                if(!this.submitEnabled) return
                const res = await axios.post("/api/users/login", this.user)
                const token = res.data.token;
                localStorage.setItem("nb.user", token);
                eventBus.$emit('signin-success')
                this.resetForm()
            } catch (err) {
                if (err.response.status === 401) {
                    this.message = "Invalid username and password. Try again!"
                }

                console.error(`Signin failed: ${err.response.data.error}`)
            }
        },
        onSelectUniversity: async function(university) {
            this.selectedUniversity = university;
            await this.loginCanvas();
        },
        loginCanvas: async function() {
            try {
                // Open Canvas OAuth Login Window
                const client_id = process.env.VUE_APP_CLIENT_ID;
                const redirect_uri = encodeURIComponent(process.env.VUE_APP_CANVAS_REDIRECT_URI);
                const state = encodeURIComponent(JSON.stringify({code: 123, canvas_url: this.selectedUniversity.canvas_url, type: "LOGIN"}));
                const scopes = encodeURIComponent("url:GET|/api/v1/courses/:course_id/sections url:GET|/api/v1/courses/:course_id/enrollments url:GET|/api/v1/users/:user_id/profile url:GET|/api/v1/courses url:GET|/api/v1/courses/:course_id/users url:GET|/api/v1/courses/:course_id/assignments url:POST|/api/v1/courses/:course_id/assignments url:PUT|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id url:POST|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/update_grades");
                const main_tab = document.activeElement;
                const login_tab = window.open(`https://${this.selectedUniversity.canvas_url}/login/oauth2/auth?client_id=${client_id}&response_type=code&redirect_uri=${redirect_uri}&state=${state}&scope=${scopes}`, '_blank');
                // Wait for OAuth Login to finish
                const interval = setInterval(async () => {
                    if (login_tab.closed) {
                        clearInterval(interval);
                        main_tab.focus();

                        // Verify Login Successful
                        const token = localStorage.getItem("nb.user");
                        if (!token) {
                            const error_message = localStorage.getItem("nb.auth_error_message"); 
                            if (error_message) { // Error set in CanvasLoginPage view
                                localStorage.removeItem("nb.auth_error_message");
                                this.canvas_message = error_message;
                            } else { // Unknown error
                                this.canvas_message = "Canvas login failed.  Please try again later...";
                            }
                            return;
                        }

                        localStorage.setItem("nb.user", token);
                        eventBus.$emit('signin-success')
                        this.resetForm()
                    }
                })
            } catch (err) {
                this.canvas_message = "Invalid Canvas user. Try again!";
                console.error(`Signin failed: ${err.response.data.error}`)
            }
        },
        resetForm: function() {
            this.user = {
            username: "",
            password: "",
            };
            this.message = null;
            this.canvas_message = null;
        },
        forgotPassword: function() {
            this.$isLoading(true) // show loading screen      
            axios.post("/api/users/forgotpassword", this.user)
            .then(() => {
                this.$isLoading(false) // hide loading screen      
                this.setForgotPasswordMessage("Email sent")
            })
            .catch(err => {
                this.$isLoading(false) // hide loading screen
                this.setForgotPasswordMessage(err.response.data.msg)
            })
        },
        setForgotPasswordMessage: function(msg, disappear=true) {
            this.forgotPasswordMessage = msg;
            if (disappear) {
            setTimeout(() => this.forgotPasswordMessage = "", 4000);
            }
        },
    },
  }
</script>

<style scoped>
  #university-select-label {
    white-space: nowrap;
  }
  #university-select {
    width: 100%;
    padding: 4px 6px;
    border-radius: 3px;
    border: solid 1px #aaa;
    font-size: 16px;
  }
  .before-reset {
    margin: 6px 0px 3px 0px;
  }
  .separator {
    display: flex;
    margin-bottom: 10px;
    align-items: center;
    text-align: center;
    width: 100%;            
    color: #555;           
    font-weight: bold;
    font-family: sans-serif;
    font-size: 14px;
  }

  .separator::before,
  .separator::after {
    content: "";
    flex: 1; /* lines take equal space */
    border-bottom: 2px solid #9e9e9e; 
  }
  .separator-text {
    padding: 0 10px; /* Only space around the text */
    color: #555;
    font-size: 14px;
  }
  .form {
    width: 380px;
    display: flex;
    flex-direction: column;
    padding: 20px;
  }
  .form .title {
    margin: 0;
    padding: 10px 0 20px 0;
  }
  .form .group {
    display: flex;
    align-items: center;
    padding-bottom: 15px;
  }
  .form .group label {
    margin-right: 5px;
  }
  .form .group input {
    padding: 4px 6px;
    border-radius: 3px;
    border: solid 1px #aaa;
    font-size: 16px;
    flex-grow: 1;
  }
  .form .message {
    color: #cf000f;
    font-size: 14px;
  }
  button.submit {
    align-self: flex-end;
    margin-bottom: 10px;
    padding: 10px 15px;
    border-radius: 5px;
    border: solid 1px #38155a;
    background-color: #4a2270;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
  }
  button.submit:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  button.submit:enabled:hover {
    background-color: #38155a;
  }
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
    align-self: flex-end;
  }

</style>
