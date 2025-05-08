import Vue from 'vue';
import BootstrapVue from 'bootstrap-vue'
import App from './App.vue';
import router from './router';

export const eventBus = new Vue();

Vue.use(BootstrapVue);

Vue.config.productionTip = false;

new Vue({
    router,
    render: h => h(App)
}).$mount('#app');
