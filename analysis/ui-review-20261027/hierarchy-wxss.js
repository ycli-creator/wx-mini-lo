.%%HERESUFFIX%%home-screen { padding-left: %%?30rpx?%%; padding-right: %%?30rpx?%%; background: linear-gradient(180deg, #fff0ee 0, #fff9f4 %%?480rpx?%%); }
wx-button { margin: 0; padding: 0; color: inherit; background: transparent; font: inherit; line-height: 1.5; text-align: left; border-radius: 0; }
wx-button::after { border: 0; }
.%%HERESUFFIX%%home-heading { min-height: %%?88rpx?%%; margin-bottom: %%?24rpx?%%; padding-right: %%?208rpx?%%; display: flex; align-items: center; justify-content: space-between; }
.%%HERESUFFIX%%home-title { font-size: %%?38rpx?%%; font-weight: 700; }
.%%HERESUFFIX%%notification-button { position: relative; width: %%?88rpx?%%; height: %%?88rpx?%%; display: flex; align-items: center; justify-content: center; }
.%%HERESUFFIX%%notification-pressed { opacity: .55; }
.%%HERESUFFIX%%notification-dot { position: absolute; top: %%?19rpx?%%; right: %%?19rpx?%%; width: %%?14rpx?%%; height: %%?14rpx?%%; border: %%?2rpx?%% solid #fff0ee; border-radius: 50%; background: var(--lp-brand); }
.%%HERESUFFIX%%memory-banner { position: relative; height: %%?330rpx?%%; margin-bottom: %%?20rpx?%%; overflow: hidden; color: #fff; background: #9c7772; border-radius: var(--lp-radius-card); }
.%%HERESUFFIX%%banner-image, .%%HERESUFFIX%%banner-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
.%%HERESUFFIX%%banner-shade { background: linear-gradient(180deg, rgba(31,22,21,.04) 25%, rgba(31,22,21,.58)); }
.%%HERESUFFIX%%banner-content { position: absolute; left: %%?30rpx?%%; right: %%?150rpx?%%; bottom: %%?30rpx?%%; }
.%%HERESUFFIX%%banner-space { display: block; overflow: hidden; margin-bottom: %%?8rpx?%%; color: #fff; font-size: %%?25rpx?%%; text-overflow: ellipsis; white-space: nowrap; }
.%%HERESUFFIX%%banner-title { display: block; font-size: %%?44rpx?%%; font-weight: 700; line-height: %%?60rpx?%%; }
.%%HERESUFFIX%%banner-stat { position: absolute; top: %%?22rpx?%%; right: %%?24rpx?%%; min-width: %%?108rpx?%%; min-height: %%?104rpx?%%; padding: %%?8rpx?%% %%?16rpx?%%; border-radius: %%?20rpx?%%; text-align: center; color: #fff; background: rgba(48,29,22,.3); }
.%%HERESUFFIX%%banner-stat wx-text { display: block; }
.%%HERESUFFIX%%banner-stat wx-text:first-child { font-size: %%?40rpx?%%; font-weight: 700; font-variant-numeric: tabular-nums; }
.%%HERESUFFIX%%banner-stat wx-text:last-child { font-size: %%?22rpx?%%; }
.%%HERESUFFIX%%diary-entry { width: 100%; min-height: %%?124rpx?%%; padding: %%?22rpx?%% %%?28rpx?%%; display: flex; align-items: center; gap: %%?20rpx?%%; background: #ffecea; border-radius: var(--lp-radius-card); }
.%%HERESUFFIX%%entry-icon { width: %%?66rpx?%%; height: %%?66rpx?%%; flex: none; display: flex; align-items: center; justify-content: center; }
.%%HERESUFFIX%%diary-icon { background: #ffdde0; border-radius: %%?16rpx?%%; box-shadow: 0 %%?6rpx?%% %%?12rpx?%% rgba(219,82,103,.12); }
.%%HERESUFFIX%%diary-entry-title { flex: 1; font-size: %%?31rpx?%%; font-weight: 600; }
.%%HERESUFFIX%%tool-grid { margin: %%?28rpx?%% 0 %%?44rpx?%%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: %%?16rpx?%%; }
.%%HERESUFFIX%%tool-item { min-width: 0; min-height: %%?204rpx?%%; padding: %%?24rpx?%% %%?6rpx?%% %%?20rpx?%%; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: %%?10rpx?%%; background: #fff; border-radius: var(--lp-radius-card); box-shadow: var(--lp-shadow-card); font-size: %%?27rpx?%%; font-weight: 600; }
.%%HERESUFFIX%%tool-icon { width: %%?72rpx?%%; height: %%?72rpx?%%; margin-bottom: %%?6rpx?%%; display: flex; align-items: center; justify-content: center; border-radius: %%?22rpx?%%; }
.%%HERESUFFIX%%gold { background: #fff1d4; box-shadow: 0 %%?6rpx?%% %%?14rpx?%% rgba(196,144,48,.12); }
.%%HERESUFFIX%%rose { background: #ffe4e8; box-shadow: 0 %%?6rpx?%% %%?14rpx?%% rgba(222,107,129,.12); }
.%%HERESUFFIX%%blue { background: #e5f1ff; box-shadow: 0 %%?6rpx?%% %%?14rpx?%% rgba(82,146,204,.12); }
.%%HERESUFFIX%%tool-item .%%HERESUFFIX%%tool-value { color: #786d66; font-size: %%?22rpx?%%; font-weight: 400; }
.%%HERESUFFIX%%section-heading { margin: 0 %%?4rpx?%% %%?16rpx?%%; align-items: center; }
.%%HERESUFFIX%%section-title { font-size: %%?34rpx?%%; }
.%%HERESUFFIX%%section-link { min-height: %%?72rpx?%%; display: flex; align-items: center; gap: %%?6rpx?%%; color: #d74558; font-size: %%?25rpx?%%; }
.%%HERESUFFIX%%heat-strip, .%%HERESUFFIX%%action-notice { min-height: %%?124rpx?%%; margin-bottom: %%?14rpx?%%; padding: %%?24rpx?%% %%?28rpx?%%; display: flex; align-items: center; gap: %%?16rpx?%%; background: #fff; border-radius: var(--lp-radius-card); box-shadow: var(--lp-shadow-card); }
.%%HERESUFFIX%%heat-icon { border-radius: 50%; background: #fff0f2; }
.%%HERESUFFIX%%strip-title { flex: 1; font-size: %%?29rpx?%%; font-weight: 600; }
.%%HERESUFFIX%%heat-count { color: #786d66; font-size: %%?24rpx?%%; }
.%%HERESUFFIX%%heat-number { color: #d74558; font-size: %%?28rpx?%%; font-weight: 600; }
.%%HERESUFFIX%%action-notice wx-text { flex: 1; }
.%%HERESUFFIX%%empty-task { width: 100%; min-height: %%?124rpx?%%; padding: %%?26rpx?%% %%?28rpx?%%; display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: var(--lp-radius-card); box-shadow: var(--lp-shadow-card); font-size: %%?28rpx?%%; }
.%%HERESUFFIX%%empty-task-action { color: #d74558; font-size: %%?26rpx?%%; }
.%%HERESUFFIX%%task-preview { width: 100%; margin-bottom: %%?16rpx?%%; padding: %%?26rpx?%% %%?28rpx?%%; display: flex; align-items: flex-start; gap: %%?20rpx?%%; background: #fff; border-radius: var(--lp-radius-card); box-shadow: var(--lp-shadow-card); }
.%%HERESUFFIX%%task-preview-icon { width: %%?66rpx?%%; min-height: %%?66rpx?%%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #fff1f2; border-radius: %%?18rpx?%%; }
.%%HERESUFFIX%%task-preview-copy { min-width: 0; flex: 1; }
.%%HERESUFFIX%%task-preview-title { display: block; color: var(--lp-text-primary); font-size: %%?30rpx?%%; font-weight: 600; line-height: %%?44rpx?%%; overflow-wrap: anywhere; }
.%%HERESUFFIX%%task-preview-meta, .%%HERESUFFIX%%task-members { margin-top: %%?8rpx?%%; display: flex; flex-wrap: wrap; gap: %%?8rpx?%% %%?20rpx?%%; color: #786d66; font-size: %%?23rpx?%%; line-height: %%?34rpx?%%; }
.%%HERESUFFIX%%task-preview-status { flex-shrink: 0; margin-top: %%?2rpx?%%; padding: %%?6rpx?%% %%?14rpx?%%; border-radius: %%?999rpx?%%; background: #fff0f2; color: #cb4054; font-size: %%?22rpx?%%; line-height: %%?32rpx?%%; }
.%%HERESUFFIX%%task-preview-status.%%HERESUFFIX%%is-done { color: #567933; background: #edf6df; }
