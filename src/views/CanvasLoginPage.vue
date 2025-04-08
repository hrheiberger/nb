<template>
  <div class="app-wrapper">
    <nav-bar></nav-bar>
    <div class="video-wrapper">
      <iframe
        width="100%"
        height="100%"
        src="https://www.youtube.com/embed/G0ghiJWkHYY"
        title="YouTube video player"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
    <div class="app-body">
      <user-create></user-create>
      <div class="v-divide"></div>
      <user-login></user-login>
    </div>
    <a
      href="https://forms.gle/6YERC3jSu1W1zUzS8"
      class="nb-bug-link"
      target="_blank"
      >Report Bug</a
    >
  </div>
</template>

<script>
import axios from "axios";
import NavBar from "../components/NavBar.vue";
import UserCreate from "../components/user/UserCreate.vue";
import UserLogin from "../components/user/UserLogin.vue";

export default {
  name: "canvas-login-page",
  data() {
    return {
      user: null,
      messages: null,
    };
  },
  beforeMount: async function () {
    this.$isLoading(true);    
    try {
      const token = localStorage.getItem("nb.user");
      if (token) {
        setTimeout(() => {
          window.close();
        }, 250);
      }
    } catch (error) {
      console.error(error, "error from decoding token");
    }

    // Retrieve OAuth State
    let state = this.$route.query.state
    if (state == undefined) {
      setTimeout(() => {
          window.close();
      }, 250);
      return;
    } 
    else {
      state = JSON.parse(decodeURIComponent(state));
    }

    // Handle OAuth Signup
    let token;
    if (state.type == "SIGN_UP") {
      // Handle OAuth failure
      if (this.$route.query.error != undefined) {
        setTimeout(() => {
          window.close();
        }, 250);
        return;
      }
      else if (this.$route.query.code == undefined) {
        setTimeout(() => {
          window.close();
        }, 250);
        return;    
      }

      // Verify OAuth code and Register
      try {
        const code = this.$route.query.code
        const response = await axios.post("api/users/register-canvas", {code});
        token = response.data.token;
        if (token == undefined) {
          setTimeout(() => {
            window.close();
          }, 250);
          return;
        }
      } catch (error) {
        console.log(error);
        setTimeout(() => {
          window.close();
        }, 250);
        return;
      }
    }

    // Login to User
    localStorage.setItem("nb.user", token);
    setTimeout(() => {
          window.close();
    }, 250);   

  },
  components: {
    NavBar,
    UserCreate,
    UserLogin,
  },
};
</script>

<style scoped>
.nb-bug-link {
  position: fixed;
  bottom: 12px;
  left: 25px;
}
.app-wrapper {
  height: 100%;
}
.app-body {
  width: 100%;
  height: calc(100vh - var(--navbar-height) - 80px);
  padding: 40px 0;
  display: flex;
  justify-content: space-around;
}
.v-divide {
  width: 0;
  height: 100%;
  border: solid 1px #aaa;
}

.video-wrapper {
  display: none;
  position: absolute;
  padding: 3.5%;
  width: 40%;
  height: 40%;
  top: 400px;
}
</style>
