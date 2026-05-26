import { createApp } from "vue";
import "./less/reset.less";
import App from "@/App.vue";
import router from "@/router";
import { createPinia } from "pinia";

const preventPageZoom = () => {
  document.addEventListener(
    "gesturestart",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "gesturechange",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false },
  );
};

preventPageZoom();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
