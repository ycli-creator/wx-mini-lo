const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json()
  const target = targets.find(t=>t.title.includes('capture.cjs') || t.url?.includes('capture.cjs'))
  if (!target) throw Error('Review script missing')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  let next=0;const pending=new Map(), scripts=[]
  let onPause
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Debugger.scriptParsed')scripts.push(m.params);if(m.method==='Debugger.paused')onPause?.(m.params);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
  const send=(method,params={})=>new Promise(r=>{const id=++next;pending.set(id,r);ws.send(JSON.stringify({id,method,params}))})
  await send('Debugger.enable')
  const script=scripts.find(s=>s.url.endsWith('/analysis/ui-full-review-20261027/capture.cjs'))
  if(!script)throw Error('Original capture script not found')
  const source=(await send('Debugger.getScriptSource',{scriptId:script.scriptId})).result.scriptSource
  const line=source.split('\n').findIndex(l=>l.includes("setStorageSync', 'love-points-miniprogram-v1', backup"))
  if(line<0)throw Error('Restore scope not found')
  await send('Debugger.setBreakpoint',{location:{scriptId:script.scriptId,lineNumber:line,columnNumber:0}})
  const proto=await send('Runtime.evaluate',{expression:"process.mainModule.require('D:/00mini-lo/wx-mini-lo/analysis/diary/devtools/node_modules/miniprogram-automator/out/MiniProgram.js').default.prototype"})
  if(!proto.result?.result?.objectId)throw Error('Client prototype unavailable')
  const objects=await send('Runtime.queryObjects',{prototypeObjectId:proto.result.result.objectId})
  const paused=new Promise(r=>{onPause=r})
  await send('Runtime.callFunctionOn',{objectId:objects.result.objects.objectId,functionDeclaration:'function(){ if(this.length !== 1) throw Error("Expected single review client"); this[0].connection.onClose(); return true }',returnByValue:true})
  const pause=await paused
  const recovered=await send('Debugger.evaluateOnCallFrame',{callFrameId:pause.callFrames[0].callFrameId,expression:'({exact:true,value:backup,type:typeof backup})',returnByValue:true})
  const value=recovered.result?.result?.value
  if(!value?.exact || value.type==='undefined')throw Error('Exact original cache unavailable; leaving script paused')
  fs.writeFileSync(path.join(__dirname,'original-local-state.json'),JSON.stringify(value))
  console.log('Exact original cache captured directly from the suspended backup variable. Type:',value.type)
  await send('Debugger.resume')
  await send('Debugger.disable')
  ws.close()
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
