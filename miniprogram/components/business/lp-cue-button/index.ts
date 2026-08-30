import { lovePointsService } from '../../../services/love-points'
import { showError, showSuccess } from '../../../utils/ui'

Component({
  properties: {
    type: { type: String, value: 'custom_task' }, title: { type: String, value: '' }, description: { type: String, value: '' },
    resourceType: { type: String, value: '' }, resourceId: { type: String, value: '' }, actionPath: { type: String, value: '' }, actionText: { type: String, value: '去看看' }, label: { type: String, value: '@TA' },
  },
  data: { busy: false },
  methods: {
    async sendCue() {
      if (this.data.busy) return
      this.setData({ busy: true })
      try {
        await lovePointsService.cuePartner({ type: this.data.type as never, title: this.data.title, description: this.data.description, resourceType: this.data.resourceType, resourceId: this.data.resourceId, actionPath: this.data.actionPath, actionText: this.data.actionText })
        showSuccess('已在情侣聊天中 @TA')
      } catch (error) { showError(error) }
      finally { this.setData({ busy: false }) }
    },
  },
})
