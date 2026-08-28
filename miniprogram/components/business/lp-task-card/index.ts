Component({
  properties: {
    status: { type: String, value: 'todo' },
    disabled: { type: Boolean, value: false },
    title: { type: String, value: '一起完成晚餐' },
    subtitle: { type: String, value: '' },
    taskDescription: { type: String, value: '' },
    points: { type: Number, value: 120 },
  },
  data: {
    label: '待完成',
    progress: 25,
    description: '准备两个人都喜欢的菜，完成后一起记录。',
  },
  observers: {
    status(status: string) {
      const values: Record<string, { label: string; progress: number; description: string }> = {
        todo: { label: '待完成', progress: 25, description: '准备两个人都喜欢的菜，完成后一起记录。' },
        pending: { label: '待审核', progress: 75, description: '已完成晚餐并上传了一张照片。' },
        done: { label: '已完成', progress: 100, description: '已完成并通过审批，积分已经到账。' },
        rejected: { label: '已驳回', progress: 25, description: '对方已驳回，可以补充说明后重新提交。' },
        missed: { label: '未完成', progress: 0, description: '这个周期已经结束，新周期会自动更新。' },
      }
      this.setData(values[status] || values.todo)
    },
  },
  methods: {
    handleTap() { if (!this.data.disabled) this.triggerEvent('tap') },
  },
})
