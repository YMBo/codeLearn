import Vue from '../../vue/src/platforms/web/entry-runtime';
import App from './App.vue';

Vue.config.productionTip = false;
new Vue({
  render: (h) => h(App)
}).$mount('#app');
