import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import vue from "@vitejs/plugin-vue";
import postcssPxToViewport from "postcss-px-to-viewport";
// import postcssPxToRem from "postcss-px2rem";

// https://vitejs.dev/config/
const useHttps = process.env.DEV_HTTPS === "1";

export default defineConfig({
  base: process.env.NODE_ENV === "development" ? "/" : "./",
  plugins: [vue()],
  server: useHttps
    ? {
        https: {
          key: fs.readFileSync(
            path.resolve("./", ".cert/localhost-key.pem"),
          ),
          cert: fs.readFileSync(path.resolve("./", ".cert/localhost.pem")),
        },
      }
    : undefined,
  css: {
    postcss: {
      plugins: [
        // postcssPxToRem({
        //   remUnit: 75, // 基准大小 baseSize
        // }),
        postcssPxToViewport({
          unitToConvert: "px", // 需要转换的单位，默认为"px"；
          viewportWidth: 375, // 设计稿的视口宽度
          unitPrecision: 8, // 单位转换后保留的小数位数
          propList: ["*"], // 要进行转换的属性列表,*表示匹配所有,!表示不转换
          viewportUnit: "vw", // 转换后的视口单位
          fontViewportUnit: "vw", // 转换后字体使用的视口单位
          selectorBlackList: [
            "html",
            ".usePx",
            ".card-",
            ".pic_",
            ".pic-",
            ".sub-title",
            ".content-",
          ], // 不进行转换的css选择器，继续使用原有单位
          minPixelValue: 0, // 设置最小的转换数值
          mediaQuery: true, // 设置媒体查询里的单位是否需要转换单位
          replace: true, // 是否直接更换属性值，而不添加备用属性
          exclude: [/node_modules/], // 忽略某些文件夹下的文件
        }),
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve("./", "src"),
    },
    extensions: [".ts", ".less"],
  },
});
