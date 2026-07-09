import { defineStore } from "pinia";

const useStore = defineStore("douyinStore", {
  state: () => ({
    activePageIndex: 0,
    formData: {
      content:
        localStorage.getItem(`DOUYIN_FORM_DATA_CONTENT`) ||
        `#小策论/WAIT 
减脂期不上称 自己的感受才是最终的验收标准
一方面是影响个人情绪 会觉得是否没有成效 容易自暴自弃 另一方面是体重秤的数字并不能代表你现在的坚持是失败的
身体是否有水肿 沉重 肠胃是否舒适 排便是否通畅 睡眠是否良好 精气神好不好 皮肤的光泽度等 这些才是最终的验收标准
而这些都取决于你是否认真观察自己的变化
不止减脂 运动的感受 睡眠习惯等 都是如此 不是单纯的数字能够衡量的`,
    },
  }),
});

export { useStore };
