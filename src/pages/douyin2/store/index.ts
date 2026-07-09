import { defineStore } from "pinia";

const useStore = defineStore("douyin2Store", {
  state: () => ({
    formData: {
      content:
        localStorage.getItem(`DOUYIN2_FORM_DATA_CONTENT`) ||
        `［2026.06.21 xxx］

那些惴惴不安的未来
我觉得它们
都是明亮的

［2026.06.24 xxx］

我们都很仔细地思考
定义过 所谓的幸福生活
不过 我们都没有认真地活
但是我又觉得
没有认真生活也没什么
偶尔难过失落也没什么
嗯如果有你在的话

［2026.06.24 xxx］

没想过要拯救地球 
没想过要多有钱 多快乐
想吃好 喝好 想有肌肉
想我爱的人开心自己也能开心 
爱我的人不要失望 
舒舒服服地 苟且偷生 也不错`,
    },
  }),
});

export { useStore };
