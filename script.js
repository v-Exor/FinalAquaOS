/* ============================================================
   AquaOS — script.js
   Features: Login · Desktop · Window Manager · Apps
             File Saving System · Recycle Bin
             Settings · FCFS CPU Scheduling
   ============================================================ */

'use strict';

// ─── PAGE DETECTION ──────────────────────────────────────────
const IS_LOGIN   = document.body.classList.contains('login-body');
const IS_DESKTOP = document.body.classList.contains('desktop-body');

// ─── GLOBAL STATE ────────────────────────────────────────────
const state = {
  windows: {}, nextZ: 21, focusedId: null,
  startOpen: false, notifOpen: false, searchOpen: false, taskViewOpen: false, powerMenuOpen: false,
  volume: 75, brightness: 100, wifi: true, darkMode: true, notifCount: 3,
  termHistory: [], termHistIdx: -1,
  activeNoteFile: 'Untitled.txt',
  calcExpr: '', calcDisplay: '0',
  taskManTab: 'processes', perfInterval: null,
  paintTool: 'pen', paintColor: '#42a5f5', paintSize: 4,
  paintDrawing: false, paintLastX: 0, paintLastY: 0,
  settingsPanel: 'Account',
};

/* ============================================================
   VIRTUAL FILE SYSTEM (VFS)
   Persistent in-memory filesystem
   ============================================================ */

const VFS = {
  _store: {}, _nextId: 1, _recycleBin: [],
  _id() { return 'vfs_' + (this._nextId++); },
  _ts() { return new Date().toLocaleString(); },

  init() {
    const folders = ['Documents','Downloads','Pictures','Music','Videos','Desktop'];
    const roots = {};
    folders.forEach(name => {
      const id = this._id();
      this._store[id] = { id, name, type:'folder', parent:null, content:'', size:0, modified:this._ts(), deleted:false };
      roots[name] = id;
    });
    const seeds = [
      { folder:'Documents', name:'readme.txt',      content:'Welcome to AquaOS!\nThis is a sample document.\nEdit me in Notepad!' },
      { folder:'Documents', name:'notes.txt',        content:'My personal notes:\n- Buy milk\n- Fix code\n- Sleep more' },
      { folder:'Downloads', name:'install_log.txt',  content:'[OK] AquaOS 2.1 installed successfully.\n[OK] Drivers loaded.\n[OK] System ready.' },
    ];
    seeds.forEach(s => {
      const id = this._id();
      this._store[id] = { id, name:s.name, type:'file', parent:roots[s.folder], content:s.content, size:s.content.length, modified:this._ts(), deleted:false };
    });
    const uid = this._id();
    this._store[uid] = { id:uid, name:'Untitled.txt', type:'file', parent:roots['Documents'], content:'', size:0, modified:this._ts(), deleted:false };
  },

  list(folderName) {
    const parent = Object.values(this._store).find(n => n.name === folderName && n.type === 'folder' && !n.deleted);
    if (!parent) return [];
    return Object.values(this._store).filter(n => !n.deleted && n.parent === parent.id);
  },

  get(id) { return this._store[id]; },

  findByName(name, folderName) {
    const parent = Object.values(this._store).find(n => n.name === folderName && n.type === 'folder' && !n.deleted);
    if (!parent) return null;
    return Object.values(this._store).find(n => n.name === name && n.parent === parent.id && !n.deleted) || null;
  },

  createFile(name, folderName, content = '') {
    const parent = Object.values(this._store).find(n => n.name === folderName && n.type === 'folder' && !n.deleted);
    if (!parent) return null;
    const dup = Object.values(this._store).find(n => n.name === name && n.parent === parent.id && !n.deleted);
    if (dup) return dup;
    const id = this._id();
    this._store[id] = { id, name, type:'file', parent:parent.id, content, size:content.length, modified:this._ts(), deleted:false };
    return this._store[id];
  },

  createFolder(name, folderName) {
    const parent = folderName ? Object.values(this._store).find(n => n.name === folderName && n.type === 'folder' && !n.deleted) : null;
    const id = this._id();
    this._store[id] = { id, name, type:'folder', parent:parent?parent.id:null, content:'', size:0, modified:this._ts(), deleted:false };
    return this._store[id];
  },

  save(id, content) {
    if (!this._store[id]) return false;
    this._store[id].content = content; this._store[id].size = content.length; this._store[id].modified = this._ts();
    return true;
  },

  rename(id, newName) {
    if (!this._store[id]) return false;
    this._store[id].name = newName; this._store[id].modified = this._ts();
    return true;
  },

  delete(id) {
    if (!this._store[id]) return false;
    this._store[id].deleted = true; this._store[id].deletedAt = this._ts();
    this._recycleBin.push(id);
    return true;
  },

  restore(id) {
    if (!this._store[id]) return false;
    this._store[id].deleted = false; delete this._store[id].deletedAt;
    this._recycleBin = this._recycleBin.filter(x => x !== id);
    return true;
  },

  purge(id) {
    if (!this._store[id]) return false;
    delete this._store[id];
    this._recycleBin = this._recycleBin.filter(x => x !== id);
    return true;
  },

  getRecycleBin() { return this._recycleBin.map(id => this._store[id]).filter(Boolean); },
  emptyBin() { this._recycleBin.forEach(id => { delete this._store[id]; }); this._recycleBin = []; },
  allFiles() { return Object.values(this._store).filter(n => n.type === 'file' && !n.deleted); },
};

/* ============================================================
   FCFS CPU SCHEDULING
   First-Come, First-Served — Non-preemptive
   ============================================================ */

const FCFS = {
  queue: [], running: null, completed: [], ganttLog: [], clock: 0,
  _nextPid: 100, interval: null,

  submit(name, burstTime) {
    const proc = {
      pid: this._nextPid++,
      name: name || ('P' + this._nextPid),
      burstTime: parseInt(burstTime) || 1,
      arrivalTime: this.clock,
      remainingTime: parseInt(burstTime) || 1,
      startTime: null, finishTime: null,
    };
    this.queue.push(proc);
    renderFCFS();
    return proc;
  },

  tick() {
    this.clock++;
    // FCFS: if nothing running, pick the front of the queue (earliest arrival)
    if (!this.running && this.queue.length > 0) {
      this.running = this.queue.shift();
      this.running.startTime = this.clock - 1;
    }
    if (this.running) {
      this.running.remainingTime--;
      if (this.running.remainingTime <= 0) {
        this.running.finishTime = this.clock;
        const tat  = this.running.finishTime - this.running.arrivalTime;
        const wait = tat - this.running.burstTime;
        this.ganttLog.push({ pid:this.running.pid, name:this.running.name, start:this.running.startTime, end:this.running.finishTime, tat, wait });
        this.completed.push({ ...this.running, tat, wait });
        this.running = null;
      }
    }
    renderFCFS();
  },

  start() { if (this.interval) return; this.interval = setInterval(() => this.tick(), 800); },
  pause() { clearInterval(this.interval); this.interval = null; },
  reset() { this.pause(); this.queue=[]; this.running=null; this.completed=[]; this.ganttLog=[]; this.clock=0; renderFCFS(); },
};

function renderFCFS() {
  const c = document.getElementById('fcfsContainer');
  if (!c) return;
  const avgTat  = FCFS.completed.length ? (FCFS.completed.reduce((s,p)=>s+p.tat,0)/FCFS.completed.length).toFixed(2) : '—';
  const avgWait = FCFS.completed.length ? (FCFS.completed.reduce((s,p)=>s+p.wait,0)/FCFS.completed.length).toFixed(2) : '—';
  c.innerHTML = `
    <div class="fcfs-stats">
      <div class="fcfs-stat"><span>Clock</span><strong>${FCFS.clock}</strong></div>
      <div class="fcfs-stat"><span>Running</span><strong style="color:var(--aqua)">${FCFS.running?FCFS.running.name:'IDLE'}</strong></div>
      <div class="fcfs-stat"><span>Avg TAT</span><strong>${avgTat}</strong></div>
      <div class="fcfs-stat"><span>Avg Wait</span><strong>${avgWait}</strong></div>
    </div>
    <div class="fcfs-controls">
      <div class="fcfs-input-row">
        <input id="fcfsName" class="fcfs-input" placeholder="Process name" style="width:120px"/>
        <input id="fcfsBurst" class="fcfs-input" placeholder="Burst (1–20)" type="number" min="1" max="20" style="width:110px"/>
        <button class="fcfs-btn add" onclick="fcfsAddProcess()"><i class="fa-solid fa-plus"></i> Add</button>
      </div>
      <div class="fcfs-input-row">
        <button class="fcfs-btn" onclick="FCFS.start();renderFCFS()"><i class="fa-solid fa-play"></i> Run</button>
        <button class="fcfs-btn" onclick="FCFS.pause();renderFCFS()"><i class="fa-solid fa-pause"></i> Pause</button>
        <button class="fcfs-btn danger" onclick="FCFS.reset()"><i class="fa-solid fa-rotate-left"></i> Reset</button>
      </div>
    </div>
    <div class="fcfs-section-title">Gantt Chart</div>
    <div class="fcfs-gantt">
      ${(() => {
        let blocks = [...FCFS.ganttLog];
        if (FCFS.running) blocks.push({pid:FCFS.running.pid,name:FCFS.running.name,start:FCFS.running.startTime,end:FCFS.clock,active:true});
        if (!blocks.length) return '<span style="color:var(--text-dim);font-size:0.78rem">Add processes and press Run.</span>';
        return blocks.map(b=>`<div class="gantt-block${b.active?' gantt-active':''}" style="flex:${Math.max(1,b.end-b.start)}"><div class="gantt-label">${b.name}</div><div class="gantt-time">${b.start}→${b.end}</div></div>`).join('');
      })()}
    </div>
    <div class="fcfs-section-title">Ready Queue (FCFS — arrival order)</div>
    <div class="fcfs-queue">
      ${FCFS.queue.length===0
        ? '<span style="color:var(--text-dim);font-size:0.78rem">Queue empty</span>'
        : FCFS.queue.map((p,i)=>`<div class="queue-item"><span class="queue-pos">#${i+1}</span><span>${p.name}</span><span style="color:var(--text-dim)">Burst:${p.remainingTime}</span><span style="color:var(--text-dim)">Arr:${p.arrivalTime}</span></div>`).join('')}
    </div>
    <div class="fcfs-section-title">Completed Processes</div>
    <table class="process-table" style="margin-top:4px">
      <thead><tr><th>PID</th><th>Name</th><th>Burst</th><th>Arrival</th><th>Start</th><th>Finish</th><th>TAT</th><th>Wait</th></tr></thead>
      <tbody>
        ${FCFS.completed.length===0
          ? '<tr><td colspan="8" style="color:var(--text-dim);text-align:center">None yet</td></tr>'
          : FCFS.completed.map(p=>`<tr><td>${p.pid}</td><td>${p.name}</td><td>${p.burstTime}</td><td>${p.arrivalTime}</td><td>${p.startTime}</td><td>${p.finishTime}</td><td style="color:var(--aqua)">${p.tat}</td><td style="color:#ffca28">${p.wait}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

function fcfsAddProcess() {
  const n = document.getElementById('fcfsName'), b = document.getElementById('fcfsBurst');
  if (!n || !b) return;
  const name = n.value.trim() || ('P'+(FCFS._nextPid)), burst = parseInt(b.value)||3;
  if (burst < 1 || burst > 20) { showToast('Burst must be 1–20','error'); return; }
  FCFS.submit(name, burst);
  n.value = ''; b.value = '';
  showToast(`"${name}" added to FCFS queue`, 'success');
}

/* ============================================================
   LOGIN
   ============================================================ */

function initLogin() {
  startParticles(); updateLockClock(); setInterval(updateLockClock, 1000);
  const inp = document.getElementById('passwordInput');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  inp.focus();
}

function updateLockClock() {
  const now = new Date();
  const t = document.getElementById('lockTime'), d = document.getElementById('lockDate');
  if (t) t.textContent = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  if (d) d.textContent = now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
}

function attemptLogin() {
  const overlay = document.getElementById('transitionOverlay');
  overlay.classList.add('active');
  setTimeout(() => { window.location.href = 'desktop.html'; }, 600);
}

function showShutdown() { document.getElementById('shutdownOverlay').classList.add('visible'); }
function hideShutdown()  { document.getElementById('shutdownOverlay').classList.remove('visible'); }
function triggerShutdown(type) {
  hideShutdown();
  const overlay = document.getElementById('transitionOverlay'); overlay.classList.add('active');
  setTimeout(() => {
    if (type==='restart') window.location.reload();
    else document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#1e88e5;font-family:Rajdhani,sans-serif;font-size:1.1rem;letter-spacing:3px;text-transform:uppercase">${type==='sleep'?'Sleeping...':'Shutting down...'}</div>`;
  }, 600);
}

function startParticles() {
  const canvas = document.getElementById('particles-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize(); window.addEventListener('resize', resize);
  const pts = Array.from({length:80}, () => ({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height,
    vx:(Math.random()-.5)*.4, vy:(Math.random()-.5)*.4,
    r:Math.random()*2+.5, a:Math.random()*.5+.1,
  }));
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => {
      p.x=(p.x+p.vx+canvas.width)%canvas.width; p.y=(p.y+p.vy+canvas.height)%canvas.height;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=`rgba(100,181,246,${p.a})`; ctx.fill();
    });
    for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
      if (d<100) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(66,165,245,${.08*(1-d/100)})`; ctx.lineWidth=.5; ctx.stroke(); }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ============================================================
   DESKTOP INIT
   ============================================================ */

function initDesktop() {
  VFS.init();
  updateTrayClocks(); setInterval(updateTrayClocks, 1000);
  startPerfMonitor();
  document.addEventListener('mousedown', handleGlobalClick);
  document.addEventListener('contextmenu', handleDesktopContextMenu);
  document.getElementById('desktopIcons').addEventListener('click', clearIconSelection);
  document.addEventListener('keydown', handleKeyboard);
}

function updateTrayClocks() {
  const now = new Date();
  const t = document.getElementById('trayTime'), d = document.getElementById('trayDate');
  if (t) t.textContent = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  if (d) d.textContent = now.toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'numeric'});
}

function handleGlobalClick(e) {
  const start=document.getElementById('startMenu'), startBtn=document.getElementById('startBtn');
  const ctx=document.getElementById('contextMenu'), notif=document.getElementById('notifCenter'), pm=document.getElementById('powerMenu');
  if (start&&start.classList.contains('visible')&&!start.contains(e.target)&&!startBtn.contains(e.target)&&!pm.contains(e.target)) closeStartMenu();
  if (ctx&&ctx.classList.contains('visible')&&!ctx.contains(e.target)) hideContextMenu();
  if (notif&&notif.classList.contains('visible')&&!notif.contains(e.target)&&!document.querySelector('.notif-btn')?.contains(e.target)) closeNotifCenter();
  if (pm&&pm.classList.contains('visible')&&!pm.contains(e.target)) hidePowerMenu();
}

function handleKeyboard(e) {
  if (e.key==='Escape') { closeStartMenu(); closeSearch(); closeTaskView(); hideContextMenu(); hidePowerMenu(); }
  if (e.ctrlKey&&e.key==='f') { e.preventDefault(); openSearch(); }
  if (e.ctrlKey&&e.key==='s') { e.preventDefault(); if (state.focusedId==='notepad') notepadSave(); }
  if (e.metaKey||(e.ctrlKey&&e.key==='Escape')) toggleStartMenu();
}

/* ============================================================
   WINDOW MANAGEMENT
   ============================================================ */

const APP_DEFS = {
  fileExplorer: {title:'File Explorer', icon:'fa-solid fa-folder-open', w:720,h:500},
  browser:      {title:'Browser',       icon:'fa-solid fa-globe',       w:760,h:520},
  notepad:      {title:'Notepad',       icon:'fa-solid fa-note-sticky', w:580,h:440},
  calculator:   {title:'Calculator',    icon:'fa-solid fa-calculator',  w:300,h:460},
  settings:     {title:'Settings',      icon:'fa-solid fa-gear',        w:700,h:540},
  terminal:     {title:'Terminal',      icon:'fa-solid fa-terminal',    w:620,h:420},
  taskManager:  {title:'Task Manager',  icon:'fa-solid fa-chart-bar',   w:700,h:520},
  paint:        {title:'Paint',         icon:'fa-solid fa-paintbrush',  w:700,h:500},
  recycleBin:   {title:'Recycle Bin',   icon:'fa-solid fa-trash-can',   w:580,h:420},
};

function openApp(appId, opts) {
  closeStartMenu();
  if (state.windows[appId]&&!state.windows[appId].minimized) { focusWindow(appId); return; }
  if (state.windows[appId]&&state.windows[appId].minimized)  { restoreWindow(appId); return; }
  const def = APP_DEFS[appId]; if (!def) return;
  const el = document.createElement('div');
  el.className = 'os-window focused'; el.id = 'win-'+appId;
  const ox = 80+Math.random()*200, oy = 60+Math.random()*100;
  el.style.cssText = `width:${def.w}px;height:${def.h}px;left:${ox}px;top:${oy}px;`;
  el.innerHTML = `
    <div class="window-titlebar" onmousedown="startDrag(event,'${appId}')">
      <i class="window-icon ${def.icon}"></i>
      <span class="window-title">${def.title}</span>
      <div class="window-controls">
        <button class="wc-btn minimize" onclick="minimizeWindow('${appId}')" title="Minimize"><i class="fa-solid fa-minus"></i></button>
        <button class="wc-btn maximize" onclick="toggleMaximize('${appId}')" title="Maximize"><i class="fa-solid fa-expand"></i></button>
        <button class="wc-btn close"    onclick="closeWindow('${appId}')"    title="Close"   ><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
    <div class="window-content" id="wc-${appId}">${buildAppContent(appId, opts)}</div>
    <div class="resize-handle" onmousedown="startResize(event,'${appId}')"></div>`;
  document.getElementById('windowsContainer').appendChild(el);
  state.windows[appId] = {el, title:def.title, icon:def.icon, minimized:false, maximized:false, zIndex:++state.nextZ, prevStyle:null};
  el.style.zIndex = state.nextZ;
  focusWindow(appId); addTaskbarEntry(appId); postInitApp(appId, opts);
}

function buildAppContent(appId, opts) {
  switch(appId) {
    case 'fileExplorer': return buildFileExplorer();
    case 'browser':      return buildBrowser();
    case 'notepad':      return buildNotepad(opts);
    case 'calculator':   return buildCalculator();
    case 'settings':     return buildSettings();
    case 'terminal':     return buildTerminal();
    case 'taskManager':  return buildTaskManager();
    case 'paint':        return buildPaint();
    case 'recycleBin':   return buildRecycleBin();
    default: return '<div style="padding:20px;color:#90caf9">App not found.</div>';
  }
}

function postInitApp(appId, opts) {
  if (appId==='terminal')    initTerminal();
  if (appId==='taskManager') startTaskManager();
  if (appId==='paint')       initPaintCanvas();
  if (appId==='notepad'&&opts?.fileId) setTimeout(()=>loadNotepadFile(opts.fileId), 30);
}

function focusWindow(id) {
  if (!state.windows[id]) return;
  Object.keys(state.windows).forEach(w => { if (state.windows[w]?.el) state.windows[w].el.classList.remove('focused'); });
  state.windows[id].el.classList.add('focused');
  state.windows[id].el.style.zIndex = ++state.nextZ;
  state.windows[id].zIndex = state.nextZ;
  state.focusedId = id;
  updateTaskbarEntries();
}

function minimizeWindow(id) { const w=state.windows[id]; if(!w)return; w.minimized=true; w.el.classList.add('minimized'); updateTaskbarEntries(); }
function restoreWindow(id)   { const w=state.windows[id]; if(!w)return; w.minimized=false; w.el.classList.remove('minimized'); focusWindow(id); }

function toggleMaximize(id) {
  const w=state.windows[id]; if(!w)return;
  if (!w.maximized) {
    w.prevStyle={width:w.el.style.width,height:w.el.style.height,left:w.el.style.left,top:w.el.style.top};
    w.el.style.cssText+=`width:100vw!important;height:calc(100vh - var(--taskbar-h))!important;left:0!important;top:0!important;border-radius:0!important;`;
    w.el.classList.add('maximized'); w.el.querySelector('.wc-btn.maximize i').className='fa-solid fa-compress'; w.maximized=true;
  } else {
    const ps=w.prevStyle; w.el.style.width=ps.width; w.el.style.height=ps.height; w.el.style.left=ps.left; w.el.style.top=ps.top;
    w.el.style.removeProperty('border-radius'); w.el.classList.remove('maximized'); w.el.querySelector('.wc-btn.maximize i').className='fa-solid fa-expand'; w.maximized=false;
  }
  focusWindow(id);
}

function closeWindow(id) {
  const w=state.windows[id]; if(!w)return;
  w.el.style.animation='windowOpen 0.18s cubic-bezier(0.4,0,0.2,1) reverse both';
  setTimeout(()=>{
    w.el.remove(); delete state.windows[id]; removeTaskbarEntry(id);
    if (id==='taskManager') { clearInterval(state.perfInterval); state.perfInterval=null; FCFS.pause(); }
  }, 180);
}

function showDesktop() {
  const any=Object.values(state.windows).some(w=>!w.minimized);
  if (any) Object.keys(state.windows).forEach(id=>minimizeWindow(id));
  else Object.keys(state.windows).forEach(id=>restoreWindow(id));
}

/* ── DRAG & RESIZE ─────────────────────────────────────────── */
let drag = null;
function startDrag(e,id) {
  if (e.target.closest('.window-controls')) return; e.preventDefault();
  const w=state.windows[id]; if(!w||w.maximized)return; focusWindow(id);
  drag={id,type:'move',startX:e.clientX,startY:e.clientY,origLeft:parseInt(w.el.style.left)||0,origTop:parseInt(w.el.style.top)||0};
  document.addEventListener('mousemove',onDrag); document.addEventListener('mouseup',stopDrag);
}
function startResize(e,id) {
  e.preventDefault(); e.stopPropagation();
  const w=state.windows[id]; if(!w||w.maximized)return; focusWindow(id);
  drag={id,type:'resize',startX:e.clientX,startY:e.clientY,origW:w.el.offsetWidth,origH:w.el.offsetHeight};
  document.addEventListener('mousemove',onDrag); document.addEventListener('mouseup',stopDrag);
}
function onDrag(e) {
  if(!drag)return; const w=state.windows[drag.id]; if(!w)return;
  const dx=e.clientX-drag.startX, dy=e.clientY-drag.startY;
  if (drag.type==='move') {
    w.el.style.left=(drag.origLeft+dx)+'px'; w.el.style.top=Math.max(0,drag.origTop+dy)+'px';
    const z=getSnapZone(e.clientX,e.clientY); if(z)showSnapPreview(z); else removeSnapPreview();
  } else { w.el.style.width=Math.max(320,drag.origW+dx)+'px'; w.el.style.height=Math.max(220,drag.origH+dy)+'px'; }
}
function stopDrag(e) {
  if(!drag)return;
  if(drag.type==='move'){const z=getSnapZone(e.clientX,e.clientY); if(z)applySnap(drag.id,z); removeSnapPreview();}
  drag=null; document.removeEventListener('mousemove',onDrag); document.removeEventListener('mouseup',stopDrag);
}
function getSnapZone(x,y) { if(x<=8)return'left'; if(x>=window.innerWidth-8)return'right'; if(y<=4)return'full'; return null; }
function applySnap(id,zone) {
  const w=state.windows[id]; if(!w)return; const th=window.innerHeight-48,tw=window.innerWidth;
  if(zone==='left')  w.el.style.cssText+=`left:0!important;top:0!important;width:${tw/2}px!important;height:${th}px!important;`;
  if(zone==='right') w.el.style.cssText+=`left:${tw/2}px!important;top:0!important;width:${tw/2}px!important;height:${th}px!important;`;
  if(zone==='full')  toggleMaximize(id);
  w.el.classList.remove('maximized');
}
function showSnapPreview(zone) {
  removeSnapPreview(); const p=document.createElement('div'); p.className='snap-preview'; p.id='snapPreview';
  const tw=window.innerWidth,th=window.innerHeight-48;
  if(zone==='left')  Object.assign(p.style,{left:'0',top:'0',width:tw/2+'px',height:th+'px'});
  if(zone==='right') Object.assign(p.style,{left:tw/2+'px',top:'0',width:tw/2+'px',height:th+'px'});
  if(zone==='full')  Object.assign(p.style,{left:'0',top:'0',width:tw+'px',height:th+'px'});
  document.body.appendChild(p);
}
function removeSnapPreview() { const p=document.getElementById('snapPreview'); if(p)p.remove(); }

/* ── TASKBAR ────────────────────────────────────────────────── */
function addTaskbarEntry(id) {
  const w=state.windows[id]; if(!w)return;
  const c=document.getElementById('taskbarOpenApps');
  const btn=document.createElement('button'); btn.className='open-app-btn active'; btn.id='tbtn-'+id;
  btn.innerHTML=`<i class="${APP_DEFS[id]?.icon||'fa-solid fa-window-maximize'}"></i> ${w.title.substring(0,14)}`;
  btn.onclick=()=>{ if(state.windows[id].minimized)restoreWindow(id); else if(state.focusedId===id)minimizeWindow(id); else focusWindow(id); };
  c.appendChild(btn);
}
function removeTaskbarEntry(id) { const b=document.getElementById('tbtn-'+id); if(b)b.remove(); }
function updateTaskbarEntries() {
  Object.keys(state.windows).forEach(id=>{
    const btn=document.getElementById('tbtn-'+id); if(!btn)return;
    btn.classList.remove('active','minimized-app');
    const w=state.windows[id];
    if(w.minimized)btn.classList.add('minimized-app'); else if(id===state.focusedId)btn.classList.add('active');
  });
}

/* ── START MENU ─────────────────────────────────────────────── */
function toggleStartMenu() {
  const menu=document.getElementById('startMenu'),btn=document.getElementById('startBtn');
  state.startOpen=!state.startOpen; menu.classList.toggle('visible',state.startOpen); btn.classList.toggle('active',state.startOpen);
  if(state.startOpen){setTimeout(()=>document.getElementById('startSearchInput')?.focus(),50); closeNotifCenter(); hidePowerMenu();}
}
function closeStartMenu() {
  document.getElementById('startMenu')?.classList.remove('visible');
  document.getElementById('startBtn')?.classList.remove('active');
  state.startOpen=false; hidePowerMenu();
}
function filterStartApps(q) {
  document.querySelectorAll('#startAppsGrid .start-app').forEach(item=>{
    item.style.display=item.querySelector('span').textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}

/* ── NOTIF & QUICK SETTINGS ─────────────────────────────────── */
function toggleNotifCenter() {
  const nc=document.getElementById('notifCenter'); state.notifOpen=!state.notifOpen;
  nc.classList.toggle('visible',state.notifOpen);
  if(state.notifOpen){closeStartMenu(); document.getElementById('notifBadge').style.display='none';}
}
function closeNotifCenter() { document.getElementById('notifCenter')?.classList.remove('visible'); state.notifOpen=false; }
function clearNotifs() { document.getElementById('notifList').innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.82rem">No notifications</div>`; }
function toggleQS(id) { document.getElementById('qs'+id.charAt(0).toUpperCase()+id.slice(1))?.classList.toggle('active'); }
function changeVolume(val) {
  state.volume=val;
  const i=document.getElementById('volumeIcon'); if(!i)return;
  i.className=val==0?'fa-solid fa-volume-xmark':val<40?'fa-solid fa-volume-low':'fa-solid fa-volume-high';
}
function changeBrightness(val) {
  state.brightness=val;
  const o=document.getElementById('brightnessOverlay'); if(o)o.style.opacity=(1-val/100)*0.85;
}
function toggleVolume() {
  state.volume=state.volume>0?0:75;
  const s=document.getElementById('volumeSlider'); if(s)s.value=state.volume; changeVolume(state.volume);
}
function toggleWifi() {
  state.wifi=!state.wifi;
  const btn=document.getElementById('wifiBtn'); if(btn)btn.style.color=state.wifi?'':'var(--text-dim)';
  showToast(state.wifi?'Wi-Fi connected':'Wi-Fi disconnected',state.wifi?'success':'');
}

/* ── POWER ───────────────────────────────────────────────────── */
function showPowerMenu() { document.getElementById('powerMenu').classList.add('visible'); state.powerMenuOpen=true; }
function hidePowerMenu()  { document.getElementById('powerMenu')?.classList.remove('visible'); state.powerMenuOpen=false; }
function triggerAction(action) {
  hidePowerMenu(); closeStartMenu();
  const overlay=document.getElementById('transitionOverlay'); overlay.classList.add('active');
  setTimeout(()=>{
    if(action==='signout')window.location.href='index.html';
    else if(action==='restart')window.location.reload();
    else document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#1e88e5;font-family:Rajdhani,sans-serif;font-size:1.1rem;letter-spacing:3px;text-transform:uppercase">${action==='sleep'?'Sleeping...':'Shutting down...'}</div>`;
  },500);
}

/* ── SEARCH ─────────────────────────────────────────────────── */
function openSearch() { document.getElementById('searchOverlay').classList.add('visible'); state.searchOpen=true; setTimeout(()=>document.getElementById('bigSearchInput')?.focus(),50); }
function closeSearch() { document.getElementById('searchOverlay')?.classList.remove('visible'); state.searchOpen=false; }

const SEARCHABLE_APPS = [
  {name:'File Explorer',appId:'fileExplorer',icon:'fa-solid fa-folder-open'},
  {name:'Browser',appId:'browser',icon:'fa-solid fa-globe'},
  {name:'Notepad',appId:'notepad',icon:'fa-solid fa-note-sticky'},
  {name:'Calculator',appId:'calculator',icon:'fa-solid fa-calculator'},
  {name:'Settings',appId:'settings',icon:'fa-solid fa-gear'},
  {name:'Terminal',appId:'terminal',icon:'fa-solid fa-terminal'},
  {name:'Task Manager',appId:'taskManager',icon:'fa-solid fa-chart-bar'},
  {name:'Paint',appId:'paint',icon:'fa-solid fa-paintbrush'},
  {name:'Recycle Bin',appId:'recycleBin',icon:'fa-solid fa-trash-can'},
];

function bigSearch(query) {
  const res=document.getElementById('searchResults'); if(!res)return;
  if(!query){res.innerHTML='';return;}
  const q=query.toLowerCase();
  const appM=SEARCHABLE_APPS.filter(a=>a.name.toLowerCase().includes(q));
  const fileM=VFS.allFiles().filter(f=>f.name.toLowerCase().includes(q));
  if(!appM.length&&!fileM.length){res.innerHTML=`<div class="search-result-item" style="color:var(--text-dim)">No results for "${query}"</div>`;return;}
  res.innerHTML=[
    ...appM.map(a=>`<div class="search-result-item" onclick="openApp('${a.appId}');closeSearch()"><i class="${a.icon}"></i>${a.name}<span style="font-size:0.72rem;color:var(--text-dim);margin-left:auto">App</span></div>`),
    ...fileM.map(f=>`<div class="search-result-item" onclick="openFileInNotepad('${f.id}');closeSearch()"><i class="fa-solid fa-file-lines"></i>${f.name}<span style="font-size:0.72rem;color:var(--text-dim);margin-left:auto">File</span></div>`),
  ].join('');
}

/* ── TASK VIEW ──────────────────────────────────────────────── */
function toggleTaskView() {
  const tv=document.getElementById('taskView'); state.taskViewOpen=!state.taskViewOpen;
  tv.classList.toggle('visible',state.taskViewOpen); if(state.taskViewOpen)renderTaskView();
}
function closeTaskView() { document.getElementById('taskView')?.classList.remove('visible'); state.taskViewOpen=false; }
function renderTaskView() {
  const c=document.getElementById('taskViewWindows'); c.innerHTML='';
  const open=Object.keys(state.windows).filter(id=>!state.windows[id].minimized);
  if(!open.length){c.innerHTML='<div style="color:var(--text-dim);font-size:0.9rem">No open windows</div>';return;}
  open.forEach(id=>{
    const w=state.windows[id];
    const t=document.createElement('div'); t.className='tv-window-thumb';
    t.innerHTML=`<div style="padding:20px;color:var(--text-dim);font-size:0.75rem">${w.title}</div><div class="tv-thumb-title"><i class="${APP_DEFS[id]?.icon||''}"></i>${w.title}</div><button class="tv-close-btn" onclick="event.stopPropagation();closeWindow('${id}');renderTaskView()"><i class="fa-solid fa-xmark"></i></button>`;
    t.onclick=()=>{focusWindow(id);toggleTaskView();};
    c.appendChild(t);
  });
}

/* ── CONTEXT MENU ───────────────────────────────────────────── */
function handleDesktopContextMenu(e) {
  if(e.target.closest('.os-window')||e.target.closest('.taskbar')||e.target.closest('.start-menu')||e.target.closest('.desktop-icon'))return;
  e.preventDefault(); showContextMenu(e,'desktop',null);
}
function showContextMenu(e, type, target) {
  e.preventDefault(); e.stopPropagation();
  const menu=document.getElementById('contextMenu');
  let items=[];
  if(type==='desktop') items=[
    {label:'New Text File',    icon:'fa-solid fa-file-plus',  action:`promptNewFileInFolder('${explorerCurrentFolder}')`},
    {label:'New Folder',       icon:'fa-solid fa-folder-plus',action:`promptNewSubFolder('${explorerCurrentFolder}')`},
    {divider:true},
    {label:'Display Settings', icon:'fa-solid fa-display',    action:`openApp('settings')`},
    {label:'Personalize',      icon:'fa-solid fa-palette',    action:`openApp('settings')`},
  ];
  else if(type==='desktop-icon') items=[
    {label:'Open',       icon:'fa-solid fa-arrow-up-right-from-square',action:`openApp('${target}')`},
    {divider:true},
    {label:'Properties', icon:'fa-solid fa-circle-info',action:`showToast('${target} properties','')`},
  ];
  else if(type==='vfs-file') items=[
    {label:'Open in Notepad', icon:'fa-solid fa-note-sticky',   action:`openFileInNotepad('${target}')`},
    {label:'Rename',          icon:'fa-solid fa-pen',            action:`promptRename('${target}')`},
    {divider:true},
    {label:'Delete',          icon:'fa-solid fa-trash',          action:`deleteVfsFile('${target}')`},
  ];
  else if(type==='vfs-folder') items=[
    {label:'New File Here',   icon:'fa-solid fa-file-plus',      action:`promptNewFileInFolder('${target}')`},
    {label:'New Folder Here', icon:'fa-solid fa-folder-plus',    action:`promptNewSubFolder('${target}')`},
    {divider:true},
    {label:'Rename',          icon:'fa-solid fa-pen',            action:`promptRename('${target}')`},
  ];
  else if(type==='recycle-item') items=[
    {label:'Restore',             icon:'fa-solid fa-rotate-left',action:`recycleBinRestore('${target}')`},
    {label:'Delete Permanently',  icon:'fa-solid fa-trash',      action:`recycleBinPurge('${target}')`},
  ];

  menu.innerHTML=items.map(item=>item.divider
    ?`<div class="ctx-divider"></div>`
    :`<button class="ctx-item" onclick="hideContextMenu();${item.action}"><i class="${item.icon}"></i>${item.label}</button>`
  ).join('');
  menu.style.visibility='hidden'; menu.classList.add('visible');
  const mw=menu.offsetWidth,mh=menu.offsetHeight; menu.style.visibility='';
  let x=e.clientX,y=e.clientY;
  if(x+mw>window.innerWidth)x=window.innerWidth-mw-4; if(y+mh>window.innerHeight)y=window.innerHeight-mh-4;
  menu.style.left=x+'px'; menu.style.top=y+'px';
}
function hideContextMenu() { document.getElementById('contextMenu')?.classList.remove('visible'); }
function clearIconSelection() { document.querySelectorAll('.desktop-icon.selected').forEach(el=>el.classList.remove('selected')); }

/* ── TOAST ──────────────────────────────────────────────────── */
function showToast(msg, type='') {
  const c=document.getElementById('toastContainer'); if(!c)return;
  const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut 0.3s ease both'; setTimeout(()=>t.remove(),300);},3000);
}

/* ============================================================
   FILE EXPLORER  (VFS-backed)
   ============================================================ */

let explorerCurrentFolder = 'Documents';

function buildFileExplorer() {
  return `
  <div class="explorer-wrap">
    <div class="explorer-toolbar">
      <button class="explorer-nav-btn" onclick="explorerGoUp()" title="Up"><i class="fa-solid fa-arrow-up"></i></button>
      <input class="explorer-path" id="explorerPath" value="${explorerCurrentFolder}" readonly/>
      <button class="explorer-nav-btn" onclick="refreshExplorer()" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
      <button class="explorer-nav-btn" onclick="promptNewFileInFolder(explorerCurrentFolder)" title="New File" style="color:#a5d6a7"><i class="fa-solid fa-file-plus"></i></button>
      <button class="explorer-nav-btn" onclick="promptNewSubFolder(explorerCurrentFolder)" title="New Folder" style="color:#ffca28"><i class="fa-solid fa-folder-plus"></i></button>
    </div>
    <div class="explorer-body">
      <div class="explorer-sidebar" id="explorerSidebar">${buildExplorerSidebar()}</div>
      <div class="explorer-main" id="explorerMain">${renderFileGrid(explorerCurrentFolder)}</div>
    </div>
  </div>`;
}

function buildExplorerSidebar() {
  const special=['Documents','Downloads','Pictures','Music','Videos','Desktop'];
  return special.map(name=>`<div class="sidebar-item${name===explorerCurrentFolder?' active':''}" onclick="navigateTo('${name}')"><i class="${getFolderIcon(name)}"></i>${name}</div>`).join('')+
  `<div class="sidebar-item" onclick="openApp('recycleBin')"><i class="fa-solid fa-trash-can" style="color:#ef9a9a"></i>Recycle Bin</div>`;
}

function getFolderIcon(name) {
  const m={Documents:'fa-solid fa-file-lines',Downloads:'fa-solid fa-download',Pictures:'fa-solid fa-images',Music:'fa-solid fa-music',Videos:'fa-solid fa-film',Desktop:'fa-solid fa-desktop'};
  return m[name]||'fa-solid fa-folder';
}

function renderFileGrid(folderName) {
  const items=VFS.list(folderName);
  if(!items.length) return `<div style="padding:24px;color:var(--text-dim);font-size:0.85rem">Empty folder.<br><button class="notepad-btn" onclick="promptNewFileInFolder('${folderName}')" style="margin-top:8px"><i class="fa-solid fa-file-plus"></i> New File</button></div>`;
  return `<div class="file-grid">${items.map(node=>{
    const isF=node.type==='folder';
    const icon=isF?'fa-solid fa-folder':getFileIcon(node.name);
    const meta=isF?'':`<br><span style="font-size:0.63rem;color:var(--text-dim)">${node.size}B · ${node.modified.split(',')[0]}</span>`;
    return `<div class="file-item${isF?' folder':''}" ondblclick="${isF?`navigateTo('${node.name}')`:`openFileInNotepad('${node.id}')`}" oncontextmenu="showContextMenu(event,'vfs-${isF?'folder':'file'}','${isF?node.name:node.id}')"><i class="${icon}"></i><span>${node.name}${meta}</span></div>`;
  }).join('')}</div>`;
}

function getFileIcon(name) {
  const ext=name.split('.').pop().toLowerCase();
  const m={txt:'fa-solid fa-file-lines',md:'fa-solid fa-file-lines',js:'fa-solid fa-file-code',css:'fa-solid fa-file-code',html:'fa-solid fa-file-code',jpg:'fa-solid fa-file-image',png:'fa-solid fa-file-image',mp3:'fa-solid fa-file-audio',mp4:'fa-solid fa-file-video',exe:'fa-solid fa-file-code',zip:'fa-solid fa-file-zipper',pdf:'fa-solid fa-file-pdf'};
  return m[ext]||'fa-solid fa-file';
}

function navigateTo(folderName) {
  explorerCurrentFolder=folderName;
  const main=document.getElementById('explorerMain'),path=document.getElementById('explorerPath'),sb=document.getElementById('explorerSidebar');
  if(main)main.innerHTML=renderFileGrid(folderName); if(path)path.value=folderName; if(sb)sb.innerHTML=buildExplorerSidebar();
}

function explorerGoUp() { navigateTo('Documents'); }
function refreshExplorer() {
  if (state.windows['fileExplorer'] && !state.windows['fileExplorer'].minimized) navigateTo(explorerCurrentFolder);
}

function openFileInNotepad(fileId) {
  const node=VFS.get(fileId); if(!node||node.type!=='file')return;
  if(state.windows['notepad']){loadNotepadFile(fileId); restoreWindow('notepad');}
  else openApp('notepad',{fileId});
}

function deleteVfsFile(fileId) {
  const node=VFS.get(fileId); if(!node)return;
  if(VFS.delete(fileId)){showToast(`"${node.name}" moved to Recycle Bin`,''); refreshExplorer();}
}

function promptNewFileInFolder(folderName) {
  const name=window.prompt('File name (e.g. notes.txt):','New File.txt'); if(!name)return;
  const node=VFS.createFile(name.trim(),folderName,'');
  if(node){showToast(`Created "${node.name}" in ${folderName}`,'success'); refreshExplorer();}
}

function promptNewSubFolder(parentName) {
  const name=window.prompt('Folder name:','New Folder'); if(!name)return;
  VFS.createFolder(name.trim(),parentName);
  showToast(`Folder "${name}" created`,'success'); refreshExplorer();
}

function promptRename(target) {
  const node=VFS.get(target)||Object.values(VFS._store).find(n=>n.name===target); if(!node)return;
  const newName=window.prompt('Rename to:',node.name); if(!newName||newName===node.name)return;
  VFS.rename(node.id,newName.trim());
  showToast(`Renamed to "${newName}"`,'success'); refreshExplorer();
}

function promptNewFile() { promptNewFileInFolder(explorerCurrentFolder); }
function promptNewFolder() { promptNewSubFolder(explorerCurrentFolder); }

/* ============================================================
   RECYCLE BIN
   ============================================================ */

function buildRecycleBin() {
  const items=VFS.getRecycleBin();
  return `
  <div class="explorer-wrap">
    <div class="explorer-toolbar">
      <span style="color:var(--text-dim);font-size:0.8rem;padding:0 8px"><i class="fa-solid fa-trash-can"></i> Recycle Bin</span>
      <button class="explorer-nav-btn" onclick="recycleBinEmptyAll()" style="color:#ef9a9a" title="Empty Bin"><i class="fa-solid fa-trash"></i> Empty All</button>
      <button class="explorer-nav-btn" onclick="recycleBinRefresh()" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
    </div>
    <div class="explorer-main" id="recycleBinMain" style="padding:10px">${renderRecycleBin(items)}</div>
  </div>`;
}

function renderRecycleBin(items) {
  if(!items||!items.length) return `<div style="padding:40px;text-align:center;color:var(--text-dim)"><i class="fa-solid fa-trash-can" style="font-size:3rem;opacity:0.2;display:block;margin-bottom:12px"></i>Recycle Bin is empty</div>`;
  return `<table class="process-table">
    <thead><tr><th>Name</th><th>Type</th><th>Deleted On</th><th>Actions</th></tr></thead>
    <tbody>${items.map(node=>`
      <tr oncontextmenu="showContextMenu(event,'recycle-item','${node.id}')">
        <td><i class="${getFileIcon(node.name)}" style="margin-right:6px;color:var(--aqua)"></i>${node.name}</td>
        <td>${node.type}</td>
        <td style="color:var(--text-dim)">${node.deletedAt||'—'}</td>
        <td>
          <button class="explorer-nav-btn" onclick="recycleBinRestore('${node.id}')" title="Restore" style="color:#a5d6a7"><i class="fa-solid fa-rotate-left"></i></button>
          <button class="explorer-nav-btn" onclick="recycleBinPurge('${node.id}')" title="Delete Permanently" style="color:#ef9a9a"><i class="fa-solid fa-xmark"></i></button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function recycleBinRefresh() {
  const m=document.getElementById('recycleBinMain'); if(m)m.innerHTML=renderRecycleBin(VFS.getRecycleBin());
}

function recycleBinRestore(id) {
  const node=VFS.get(id); if(!node)return;
  VFS.restore(id); showToast(`"${node.name}" restored`,'success');
  recycleBinRefresh(); refreshExplorer();
}

function recycleBinPurge(id) {
  const node=VFS.get(id); if(!node)return;
  if(!confirm(`Permanently delete "${node.name}"? This cannot be undone.`))return;
  VFS.purge(id); showToast(`"${node.name}" permanently deleted`,'error');
  recycleBinRefresh();
}

function recycleBinEmptyAll() {
  const items=VFS.getRecycleBin();
  if(!items.length){showToast('Recycle Bin is already empty','');return;}
  if(!confirm(`Permanently delete ${items.length} item(s)?`))return;
  VFS.emptyBin(); showToast('Recycle Bin emptied','success'); recycleBinRefresh();
}

/* ============================================================
   BROWSER
   ============================================================ */

function buildBrowser() {
  return `
  <div class="browser-wrap">
    <div class="browser-toolbar">
      <button class="browser-nav-btn"><i class="fa-solid fa-arrow-left"></i></button>
      <button class="browser-nav-btn"><i class="fa-solid fa-arrow-right"></i></button>
      <button class="browser-nav-btn"><i class="fa-solid fa-rotate-right"></i></button>
      <input class="browser-url" id="browserUrl" value="aqua://newtab" onkeydown="if(event.key==='Enter')navigateBrowser(this.value)"/>
      <button class="browser-nav-btn" onclick="navigateBrowser(document.getElementById('browserUrl').value)"><i class="fa-solid fa-arrow-right"></i></button>
    </div>
    <div class="browser-content" id="browserContent">${buildBrowserHome()}</div>
  </div>`;
}
function buildBrowserHome() {
  return `<div class="browser-home"><h2>AquaOS Web</h2>
    <div class="browser-home-search"><input id="browserHomeSearch" type="text" placeholder="Search the web..." onkeydown="if(event.key==='Enter')navigateBrowser(this.value)"/><button onclick="navigateBrowser(document.getElementById('browserHomeSearch').value)"><i class="fa-solid fa-magnifying-glass"></i></button></div>
    <div class="browser-shortcuts">
      <div class="browser-shortcut" onclick="navigateBrowser('https://google.com')"><i class="fa-brands fa-google"></i><span>Google</span></div>
      <div class="browser-shortcut" onclick="navigateBrowser('https://youtube.com')"><i class="fa-brands fa-youtube"></i><span>YouTube</span></div>
      <div class="browser-shortcut" onclick="navigateBrowser('https://github.com')"><i class="fa-brands fa-github"></i><span>GitHub</span></div>
      <div class="browser-shortcut" onclick="navigateBrowser('https://wikipedia.org')"><i class="fa-brands fa-wikipedia-w"></i><span>Wikipedia</span></div>
    </div></div>`;
}
function navigateBrowser(query) {
  let url=query.trim(); if(!url)return;
  const urlInput=document.getElementById('browserUrl'),content=document.getElementById('browserContent'); if(!content)return;
  if(!url.startsWith('http')&&!url.startsWith('aqua://'))url='https://www.google.com/search?q='+encodeURIComponent(url);
  if(urlInput)urlInput.value=url;
  if(url.startsWith('aqua://')){content.innerHTML=buildBrowserHome();return;}
  content.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-dim)"><i class="fa-solid fa-globe" style="font-size:2rem;color:var(--blue-light)"></i><div style="font-size:0.9rem">External browsing is simulated.</div><div style="font-size:0.78rem">Would navigate to: <span style="color:var(--aqua)">${url}</span></div><button onclick="document.getElementById('browserContent').innerHTML=buildBrowserHome();document.getElementById('browserUrl').value='aqua://newtab'" style="padding:7px 16px;border-radius:16px;background:var(--glass-hover);border:1px solid var(--glass-border);color:var(--text-secondary);cursor:pointer;font-size:0.82rem">← Back Home</button></div>`;
}

/* ============================================================
   NOTEPAD (VFS-backed, full file management)
   ============================================================ */

let notepadCurrentFileId = null;

function buildNotepad(opts) {
  const fileId=opts?.fileId||null;
  const node=fileId?VFS.get(fileId):null;
  notepadCurrentFileId=fileId||null;
  state.activeNoteFile=node?node.name:'Untitled.txt';
  return `
  <div class="notepad-wrap">
    <div class="notepad-toolbar">
      <button class="notepad-btn" onclick="notepadNew()" title="New file"><i class="fa-solid fa-file-plus"></i> New</button>
      <button class="notepad-btn" onclick="notepadOpen()" title="Open file"><i class="fa-solid fa-folder-open"></i> Open</button>
      <button class="notepad-btn" onclick="notepadSave()" title="Save (Ctrl+S)"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      <button class="notepad-btn" onclick="notepadSaveAs()" title="Save As"><i class="fa-solid fa-floppy-disk"></i> Save As</button>
      <button class="notepad-btn" onclick="notepadDelete()" title="Delete file" style="color:#ef9a9a"><i class="fa-solid fa-trash"></i></button>
      <span style="flex:1"></span>
      <span style="font-size:0.75rem;color:var(--text-dim);padding:0 8px" id="notepadStatus">${state.activeNoteFile}</span>
    </div>
    <div class="notepad-toolbar" style="padding-top:0;padding-bottom:4px;gap:3px">
      <button class="notepad-btn" onclick="document.execCommand('bold')"><b>B</b></button>
      <button class="notepad-btn" onclick="document.execCommand('italic')"><i>I</i></button>
      <button class="notepad-btn" onclick="document.execCommand('underline')"><u>U</u></button>
      <span style="color:var(--text-dim);font-size:0.75rem;margin-left:8px">Words: <span id="wordCount">0</span></span>
    </div>
    <textarea class="notepad-textarea" id="notepadArea" placeholder="Start typing..." oninput="notepadTrack()">${escHtml(node?node.content:'')}</textarea>
  </div>`;
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function loadNotepadFile(fileId) {
  const node=VFS.get(fileId); if(!node)return;
  notepadCurrentFileId=fileId; state.activeNoteFile=node.name;
  const area=document.getElementById('notepadArea'),status=document.getElementById('notepadStatus');
  if(area)area.value=node.content; if(status)status.textContent=node.name;
  notepadUpdateWordCount();
}

function notepadNew() {
  const name=window.prompt('File name:','Untitled.txt'); if(!name)return;
  const node=VFS.createFile(name.trim(),'Documents','');
  if(!node){showToast('Could not create file','error');return;}
  notepadCurrentFileId=node.id; state.activeNoteFile=node.name;
  const area=document.getElementById('notepadArea'),status=document.getElementById('notepadStatus');
  if(area)area.value=''; if(status)status.textContent=node.name;
  showToast(`"${node.name}" created in Documents`,'success'); refreshExplorer();
}

function notepadOpen() {
  const files=VFS.allFiles(); if(!files.length){showToast('No files found','');return;}
  const pickerId='notepadFilePicker';
  document.getElementById(pickerId)?.remove();
  const picker=document.createElement('div'); picker.id=pickerId;
  picker.style.cssText='position:absolute;inset:0;z-index:9;background:rgba(5,12,25,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border-radius:var(--radius-md)';
  picker.innerHTML=`<div style="color:var(--text-primary);font-weight:600;font-size:0.95rem">Open File</div>
    <select id="notepadPickerSelect" style="width:280px;padding:8px;background:rgba(13,34,68,0.9);border:1px solid var(--glass-border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.85rem">
      ${files.map(f=>`<option value="${f.id}">${f.name} (${getParentFolderName(f.parent)})</option>`).join('')}
    </select>
    <div style="display:flex;gap:8px">
      <button onclick="notepadPickerConfirm()" style="padding:7px 20px;border-radius:var(--radius-sm);background:var(--blue-accent);border:none;color:#fff;cursor:pointer;font-size:0.85rem">Open</button>
      <button onclick="document.getElementById('notepadFilePicker').remove()" style="padding:7px 16px;border-radius:var(--radius-sm);background:rgba(13,34,68,0.7);border:1px solid var(--glass-border);color:var(--text-secondary);cursor:pointer;font-size:0.85rem">Cancel</button>
    </div>`;
  document.getElementById('wc-notepad')?.appendChild(picker);
}

function notepadPickerConfirm() {
  const sel=document.getElementById('notepadPickerSelect'); if(!sel)return;
  document.getElementById('notepadFilePicker')?.remove();
  loadNotepadFile(sel.value);
}

function notepadSave() {
  const area=document.getElementById('notepadArea'); if(!area)return;
  if(notepadCurrentFileId){VFS.save(notepadCurrentFileId,area.value); showToast(`Saved "${state.activeNoteFile}"`,'success'); refreshExplorer();}
  else notepadSaveAs();
}

function notepadSaveAs() {
  const area=document.getElementById('notepadArea'); if(!area)return;
  const name=window.prompt('Save as:',state.activeNoteFile||'Untitled.txt'); if(!name)return;
  const node=VFS.createFile(name.trim(),'Documents',area.value);
  if(!node){showToast('Could not save','error');return;}
  VFS.save(node.id,area.value); notepadCurrentFileId=node.id; state.activeNoteFile=node.name;
  const status=document.getElementById('notepadStatus'); if(status)status.textContent=node.name;
  showToast(`Saved as "${node.name}" in Documents`,'success'); refreshExplorer();
}

function notepadDelete() {
  if(!notepadCurrentFileId){showToast('No file open','');return;}
  const node=VFS.get(notepadCurrentFileId); if(!node)return;
  if(!confirm(`Move "${node.name}" to Recycle Bin?`))return;
  VFS.delete(notepadCurrentFileId); notepadCurrentFileId=null; state.activeNoteFile='Untitled.txt';
  const area=document.getElementById('notepadArea'),status=document.getElementById('notepadStatus');
  if(area)area.value=''; if(status)status.textContent='Untitled.txt';
  showToast(`"${node.name}" moved to Recycle Bin`,''); refreshExplorer();
}

function notepadTrack() {
  const area=document.getElementById('notepadArea'); if(!area)return;
  if(notepadCurrentFileId)VFS.save(notepadCurrentFileId,area.value);
  notepadUpdateWordCount();
}

function notepadUpdateWordCount() {
  const area=document.getElementById('notepadArea'),wc=document.getElementById('wordCount');
  if(area&&wc)wc.textContent=area.value.trim()?area.value.trim().split(/\s+/).length:0;
}

function getParentFolderName(parentId) {
  if(!parentId)return'root'; const n=VFS.get(parentId); return n?n.name:'?';
}

/* ============================================================
   CALCULATOR
   ============================================================ */

function buildCalculator() {
  const rows=[['C','±','%','÷'],['7','8','9','×'],['4','5','6','−'],['1','2','3','+'],['0','0','.','⌫','=']];
  const flat=[['C',false],['±',false],['%',false],['÷',false],['7',false],['8',false],['9',false],['×',false],['4',false],['5',false],['6',false],['−',false],['1',false],['2',false],['3',false],['+',false],['0',true],['.',false],['⌫',false],['=',false]];
  return `
  <div class="calc-wrap">
    <div class="calc-display"><div class="calc-expr" id="calcExpr"></div><div class="calc-result" id="calcResult">0</div></div>
    <div class="calc-grid">
      ${flat.map(([k,span])=>{
        const isOp=['÷','×','−','+'].includes(k),isEq=k==='=';
        return `<button class="calc-btn${isOp?' op':''}${isEq?' equals':''}${span?' span2':''}" onclick="calcPress('${k}')">${k}</button>`;
      }).join('')}
    </div>
  </div>`;
}

function calcPress(key) {
  const expr=document.getElementById('calcExpr'),result=document.getElementById('calcResult'); if(!result)return;
  const opMap={'÷':'/','×':'*','−':'-','+':'+'};
  if(key==='C'){state.calcExpr='';state.calcDisplay='0';}
  else if(key==='⌫'){state.calcDisplay=state.calcDisplay.slice(0,-1)||'0';}
  else if(key==='±'){state.calcDisplay=(parseFloat(state.calcDisplay)*-1).toString();}
  else if(key==='%'){state.calcDisplay=(parseFloat(state.calcDisplay)/100).toString();}
  else if(key==='='){
    try{
      let s=(state.calcExpr+state.calcDisplay).replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-');
      const r=Function('"use strict";return('+s+')')();
      state.calcDisplay=isNaN(r)||!isFinite(r)?'Error':parseFloat(r.toFixed(10)).toString();
      if(expr)expr.textContent=s+' ='; state.calcExpr='';
    }catch{state.calcDisplay='Error';state.calcExpr='';}
  }else if(opMap[key]){
    state.calcExpr+=state.calcDisplay+' '+key+' ';state.calcDisplay='0'; if(expr)expr.textContent=state.calcExpr;
  }else{
    state.calcDisplay=state.calcDisplay==='0'&&key!=='.'?key:state.calcDisplay+key;
  }
  result.textContent=state.calcDisplay;
}

/* ============================================================
   SETTINGS (Enhanced — 10 panels including FCFS & File System)
   ============================================================ */

function buildSettings() {
  const nav=[
    {icon:'fa-solid fa-user',          label:'Account'},
    {icon:'fa-solid fa-display',       label:'Display'},
    {icon:'fa-solid fa-volume-high',   label:'Sound'},
    {icon:'fa-solid fa-wifi',          label:'Network'},
    {icon:'fa-solid fa-palette',       label:'Personalization'},
    {icon:'fa-solid fa-shield-halved', label:'Security'},
    {icon:'fa-solid fa-clock',         label:'Date & Time'},
    {icon:'fa-solid fa-microchip',     label:'CPU Scheduling'},
    {icon:'fa-solid fa-folder',        label:'File System'},
    {icon:'fa-solid fa-circle-info',   label:'About'},
  ];
  return `
  <div class="settings-wrap">
    <div class="settings-nav">
      ${nav.map(n=>`<div class="settings-nav-item${n.label===state.settingsPanel?' active':''}" onclick="switchSettingsPanel(this,'${n.label}')"><i class="${n.icon}"></i>${n.label}</div>`).join('')}
    </div>
    <div class="settings-content" id="settingsContent">${buildSettingsPanel(state.settingsPanel)}</div>
  </div>`;
}

function switchSettingsPanel(el, panel) {
  document.querySelectorAll('.settings-nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active'); state.settingsPanel=panel;
  const c=document.getElementById('settingsContent'); if(c)c.innerHTML=buildSettingsPanel(panel);
  if(panel==='CPU Scheduling') setTimeout(renderFCFS, 50);
}

function buildSettingsPanel(panel) {
  const p = {
    'Account':`<div class="settings-title">Account</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Username</strong><span>User</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Email</strong><span>user@aquaos.local</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Account Type</strong><span>Administrator</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Sign Out</strong><span>Sign out of AquaOS</span></div><button onclick="triggerAction('signout')" style="padding:6px 14px;border-radius:var(--radius-sm);background:rgba(192,57,43,0.3);border:1px solid rgba(192,57,43,0.5);color:#e57373;cursor:pointer;font-size:0.82rem">Sign Out</button></div>`,

    'Display':`<div class="settings-title">Display</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Brightness</strong><span>Adjust screen brightness</span></div><input type="range" min="20" max="100" value="${state.brightness}" oninput="changeBrightness(this.value)" style="width:120px"/></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Resolution</strong><span>${window.screen.width} × ${window.screen.height}</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Night Light</strong><span>Reduce blue light</span></div><label class="toggle-switch"><input type="checkbox" onchange="showToast('Night light '+(this.checked?'on':'off'),'')"><span class="toggle-slider"></span></label></div>`,

    'Sound':`<div class="settings-title">Sound</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Master Volume</strong><span>System audio level</span></div><input type="range" min="0" max="100" value="${state.volume}" oninput="changeVolume(this.value)" style="width:120px"/></div>
      <div class="settings-card"><div class="settings-card-left"><strong>System Sounds</strong><span>UI notification sounds</span></div><label class="toggle-switch"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>`,

    'Network':`<div class="settings-title">Network & Internet</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Wi-Fi</strong><span>${state.wifi?'Connected — AquaNet_5G':'Disconnected'}</span></div><label class="toggle-switch"><input type="checkbox" ${state.wifi?'checked':''} onchange="toggleWifi()"><span class="toggle-slider"></span></label></div>
      <div class="settings-card"><div class="settings-card-left"><strong>IP Address</strong><span>192.168.1.42</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>DNS</strong><span>8.8.8.8 (Google)</span></div></div>`,

    'Personalization':`<div class="settings-title">Personalization</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Dark Mode</strong><span>AquaOS dark theme</span></div><label class="toggle-switch"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Accent Color</strong><span>Aqua Blue</span></div><div style="display:flex;gap:6px">${['#1e88e5','#7b1fa2','#388e3c','#e53935','#f57c00'].map(c=>`<div onclick="showToast('Accent set','success')" style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:2px solid transparent" onmouseover="this.style.border='2px solid #fff'" onmouseout="this.style.border='2px solid transparent'"></div>`).join('')}</div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Transparency</strong><span>Glass blur effects</span></div><label class="toggle-switch"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>`,

    'Security':`<div class="settings-title">Security</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Firewall</strong><span>AquaWall — Active</span></div><label class="toggle-switch"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Antivirus</strong><span>AquaDefender — Up to date</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Change Password</strong><span>Update lock screen password</span></div><button onclick="showToast('Password changed (simulation)','success')" style="padding:6px 14px;border-radius:var(--radius-sm);background:var(--blue-accent);border:none;color:#fff;cursor:pointer;font-size:0.82rem">Change</button></div>`,

    'Date & Time':`<div class="settings-title">Date & Time</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Current Time</strong><span>${new Date().toLocaleTimeString()}</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Current Date</strong><span>${new Date().toLocaleDateString()}</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Timezone</strong><span>${Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div></div>`,

    'CPU Scheduling':`<div class="settings-title">CPU Scheduling — FCFS</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:12px;padding:10px;background:rgba(13,34,68,0.4);border-radius:var(--radius-sm);border-left:3px solid var(--blue-accent)">
        <strong style="color:var(--aqua)">First-Come, First-Served (FCFS)</strong><br>
        Processes execute in the order they arrive. Non-preemptive — each process runs to completion before the next.<br>
        <em>TAT = Finish − Arrival &nbsp;|&nbsp; Wait = TAT − Burst</em>
      </div>
      <div id="fcfsContainer"><div style="color:var(--text-dim);font-size:0.82rem">Loading...</div></div>`,

    'File System':`<div class="settings-title">File System</div>
      <div class="settings-card"><div class="settings-card-left"><strong>Total Files</strong><span>${VFS.allFiles().length} file(s)</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Recycle Bin</strong><span>${VFS.getRecycleBin().length} item(s)</span></div><button onclick="openApp('recycleBin')" style="padding:6px 14px;border-radius:var(--radius-sm);background:rgba(13,34,68,0.7);border:1px solid var(--glass-border);color:var(--text-secondary);cursor:pointer;font-size:0.82rem">Open</button></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Storage Used</strong><span>${VFS.allFiles().reduce((s,f)=>s+f.size,0)} bytes</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>New File (Documents)</strong><span>Create a text file</span></div><button onclick="promptNewFileInFolder('Documents')" style="padding:6px 14px;border-radius:var(--radius-sm);background:var(--blue-accent);border:none;color:#fff;cursor:pointer;font-size:0.82rem">Create</button></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Open Explorer</strong><span>Browse all files</span></div><button onclick="openApp('fileExplorer')" style="padding:6px 14px;border-radius:var(--radius-sm);background:rgba(13,34,68,0.7);border:1px solid var(--glass-border);color:var(--text-secondary);cursor:pointer;font-size:0.82rem">Open</button></div>`,

    'About':`<div class="settings-title">About AquaOS</div>
      <div class="settings-card"><div class="settings-card-left"><strong>OS Name</strong><span>AquaOS</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Version</strong><span>2.1.0 (Build 20250101)</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>CPU Scheduler</strong><span>FCFS (First-Come, First-Served) — Non-preemptive</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>File System</strong><span>AquaFS (VFS) — In-memory virtual filesystem</span></div></div>
      <div class="settings-card"><div class="settings-card-left"><strong>Kernel</strong><span>AquaKernel 5.15</span></div></div>`,
  };
  return p[panel]||`<div class="settings-title">${panel}</div><div style="color:var(--text-dim)">Coming soon.</div>`;
}

/* ============================================================
   TERMINAL (VFS-integrated)
   ============================================================ */

function buildTerminal() {
  return `
  <div class="terminal-wrap">
    <div class="terminal-output" id="termOutput">
      <div class="t-line sys">AquaOS Terminal v2.1 — Type 'help' for all commands.</div>
      <div class="t-line"></div>
    </div>
    <div class="terminal-input-row">
      <span class="terminal-prompt">user@aquaos:~$&nbsp;</span>
      <input class="terminal-input" id="termInput" autocomplete="off" spellcheck="false"/>
    </div>
  </div>`;
}

function initTerminal() {
  const inp=document.getElementById('termInput'); if(!inp)return;
  inp.focus(); inp.addEventListener('keydown', handleTerminalKey);
}

const TERM_CMDS = {
  help:    ()=>['Commands:','  ls [folder]       — list files in folder (default: Documents)','  cat <file>         — show file contents','  touch <file>       — create file in Documents','  rm <file>          — delete file (to Recycle Bin)','  mkdir <dir>        — create folder','  pwd               — print working directory','  whoami            — current user','  date              — current date','  echo <text>       — print text','  clear             — clear terminal','  sysinfo           — system info','  neofetch          — system info art','  open <app>        — open an application','  fcfs <name> <n>   — add FCFS process (burst=n ticks)'],
  pwd:     ()=>['/home/user'],
  whoami:  ()=>['user'],
  date:    ()=>[new Date().toString()],
  sysinfo: ()=>['CPU: AquaCore i9 5.0GHz  |  Scheduler: FCFS','RAM: 16GB / 32GB','GPU: AquaGPU 16GB  |  VRAM: 8GB','Disk: 512GB SSD (AquaFS VFS)','OS: AquaOS 2.1.0  |  Kernel: AquaKernel 5.15'],
  neofetch:()=>['      ###      user@aquaos','    #######    -----------','   ##  ○  ##   OS:       AquaOS 2.1.0','   ## ─── ##   Kernel:   AquaKernel 5.15','    #######    Sched:    FCFS','      ###      FS:       AquaFS (VFS)','               RAM:      8192MiB / 16384MiB','               Theme:    AquaDark'],
  clear:   ()=>{ const o=document.getElementById('termOutput'); if(o)o.innerHTML=''; return []; },
};

function handleTerminalKey(e) {
  const inp=document.getElementById('termInput'); if(!inp)return;
  if(e.key==='ArrowUp'){if(state.termHistIdx<state.termHistory.length-1)state.termHistIdx++; inp.value=state.termHistory[state.termHistory.length-1-state.termHistIdx]||''; e.preventDefault();}
  if(e.key==='ArrowDown'){if(state.termHistIdx>0)state.termHistIdx--; else{state.termHistIdx=-1;inp.value='';} inp.value=state.termHistory[state.termHistory.length-1-state.termHistIdx]||''; e.preventDefault();}
  if(e.key!=='Enter')return;

  const cmd=inp.value.trim(); inp.value=''; state.termHistIdx=-1;
  if(cmd)state.termHistory.push(cmd);
  const out=document.getElementById('termOutput'); if(!out)return;
  const cl=document.createElement('div'); cl.className='t-line cmd'; cl.textContent='user@aquaos:~$ '+cmd; out.appendChild(cl);

  const parts=cmd.trim().split(/\s+/), base=parts[0].toLowerCase();
  let lines=[];

  if(base==='ls'){
    const folder=parts[1]||'Documents';
    const items=VFS.list(folder);
    lines=items.length?items.map(n=>n.type==='folder'?`📁 ${n.name}/`:`📄 ${n.name}  (${n.size}B)`):['(empty)'];
  }else if(base==='cat'){
    const name=parts[1]; if(!name){lines=['Usage: cat <filename>'];}
    else{
      const node=VFS.findByName(name,'Documents')||VFS.findByName(name,'Downloads')||VFS.findByName(name,'Pictures');
      lines=node?node.content.split('\n'):[`cat: ${name}: No such file`];
    }
  }else if(base==='touch'){
    const name=parts[1]; if(!name){lines=['Usage: touch <filename>'];}
    else{VFS.createFile(name,'Documents',''); lines=[`Created ${name} in Documents`]; refreshExplorer();}
  }else if(base==='rm'){
    const name=parts[1]; if(!name){lines=['Usage: rm <filename>'];}
    else{
      const node=VFS.findByName(name,'Documents')||VFS.findByName(name,'Downloads');
      if(node){VFS.delete(node.id); lines=[`${name} moved to Recycle Bin`]; refreshExplorer();}
      else lines=[`rm: ${name}: No such file`];
    }
  }else if(base==='mkdir'){
    const name=parts[1]; if(!name){lines=['Usage: mkdir <dirname>'];}
    else{VFS.createFolder(name,'Documents'); lines=[`mkdir: created directory '${name}'`]; refreshExplorer();}
  }else if(base==='open'){
    const appMap={explorer:'fileExplorer',browser:'browser',notepad:'notepad',calc:'calculator',calculator:'calculator',settings:'settings',terminal:'terminal',taskmanager:'taskManager',paint:'paint',recyclebin:'recycleBin'};
    const appId=appMap[parts[1]?.toLowerCase()];
    if(appId){openApp(appId); lines=[`Opening ${parts[1]}...`];}
    else lines=[`open: '${parts[1]}': app not found. Apps: ${Object.keys(appMap).join(', ')}`];
  }else if(base==='echo'){
    lines=[parts.slice(1).join(' ')];
  }else if(base==='fcfs'){
    const name=parts[1],burst=parseInt(parts[2]);
    if(!name||isNaN(burst)){lines=['Usage: fcfs <name> <burst_ticks>','Example: fcfs P1 5'];}
    else{FCFS.submit(name,burst); lines=[`[FCFS] "${name}" (burst=${burst}) added to queue at t=${FCFS.clock}`];}
  }else if(TERM_CMDS[base]){
    const r=TERM_CMDS[base](); lines=r||[];
  }else if(cmd){
    lines=[`${cmd}: command not found. Type 'help'`];
  }

  lines.forEach(line=>{
    const el=document.createElement('div'); el.className='t-line'; el.textContent=line; out.appendChild(el);
  });
  out.scrollTop=out.scrollHeight;
}

/* ============================================================
   TASK MANAGER (with FCFS CPU Scheduling tab)
   ============================================================ */

function buildTaskManager() {
  return `
  <div class="taskman-wrap">
    <div class="taskman-tabs">
      <button class="taskman-tab active" onclick="switchTaskManTab(this,'processes')">Processes</button>
      <button class="taskman-tab"        onclick="switchTaskManTab(this,'performance')">Performance</button>
      <button class="taskman-tab"        onclick="switchTaskManTab(this,'scheduling')">CPU Scheduling</button>
      <button class="taskman-tab"        onclick="switchTaskManTab(this,'startup')">Startup</button>
    </div>
    <div class="taskman-content" id="taskManContent">${buildTaskManProcesses()}</div>
  </div>`;
}

function switchTaskManTab(el, tab) {
  document.querySelectorAll('.taskman-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); state.taskManTab=tab;
  const c=document.getElementById('taskManContent'); if(!c)return;
  if(tab==='processes')   c.innerHTML=buildTaskManProcesses();
  if(tab==='performance') c.innerHTML=buildTaskManPerformance();
  if(tab==='scheduling')  { c.innerHTML=`<div id="fcfsContainer"></div>`; setTimeout(renderFCFS,30); }
  if(tab==='startup')     c.innerHTML=buildTaskManStartup();
}

const PROCESSES=[
  {name:'System',pid:4,cpu:'0.1',mem:'18.2 MB'},{name:'aquash',pid:1032,cpu:'0.0',mem:'4.1 MB'},
  {name:'Desktop',pid:1240,cpu:'0.3',mem:'52.8 MB'},{name:'AquaUI',pid:1388,cpu:'1.2',mem:'98.4 MB'},
  {name:'Browser',pid:2048,cpu:'2.1',mem:'246.0 MB'},{name:'Security',pid:988,cpu:'0.0',mem:'12.3 MB'},
  {name:'AudioSrv',pid:1104,cpu:'0.0',mem:'8.7 MB'},{name:'NetworkMgr',pid:876,cpu:'0.0',mem:'6.2 MB'},
];

function buildTaskManProcesses() {
  return `<table class="process-table"><thead><tr><th>Name</th><th>PID</th><th>CPU %</th><th>Memory</th></tr></thead>
    <tbody>${PROCESSES.map(p=>`<tr><td>${p.name}</td><td>${p.pid}</td><td id="cpu-${p.pid}">${p.cpu}</td><td>${p.mem}</td></tr>`).join('')}</tbody></table>`;
}
function buildTaskManPerformance() {
  return `<div class="perf-grid">
    <div class="perf-card"><div class="perf-label">CPU</div><div class="perf-value" id="perfCpu">0%</div><div class="perf-bar-track"><div class="perf-bar" id="perfCpuBar" style="width:0%"></div></div></div>
    <div class="perf-card"><div class="perf-label">RAM</div><div class="perf-value" id="perfRam">0%</div><div class="perf-bar-track"><div class="perf-bar" id="perfRamBar" style="width:0%"></div></div></div>
    <div class="perf-card"><div class="perf-label">Disk</div><div class="perf-value" id="perfDisk">0%</div><div class="perf-bar-track"><div class="perf-bar" id="perfDiskBar" style="width:0%"></div></div></div>
    <div class="perf-card"><div class="perf-label">Network</div><div class="perf-value" id="perfNet">0 Mbps</div><div class="perf-bar-track"><div class="perf-bar" id="perfNetBar" style="width:0%"></div></div></div>
  </div>`;
}
function buildTaskManStartup() {
  const apps=[{name:'AquaUI',impact:'High',status:'Enabled'},{name:'Security',impact:'Low',status:'Enabled'},{name:'AudioSrv',impact:'Low',status:'Enabled'},{name:'OneDrive',impact:'Medium',status:'Disabled'}];
  return `<table class="process-table"><thead><tr><th>Name</th><th>Impact</th><th>Status</th></tr></thead>
    <tbody>${apps.map(a=>`<tr><td>${a.name}</td><td>${a.impact}</td><td style="color:${a.status==='Enabled'?'var(--aqua)':'var(--text-dim)'}">${a.status}</td></tr>`).join('')}</tbody></table>`;
}
function startTaskManager() { updatePerfStats(); if(state.perfInterval)clearInterval(state.perfInterval); state.perfInterval=setInterval(updatePerfStats,1500); }
function updatePerfStats() {
  const cpu=(Math.random()*25+5).toFixed(1),ram=(Math.random()*30+40).toFixed(1),disk=(Math.random()*10+2).toFixed(1),net=(Math.random()*50+5).toFixed(1);
  const set=(id,val,bar,pct)=>{const e=document.getElementById(id);if(e)e.textContent=val;const b=document.getElementById(bar);if(b)b.style.width=pct+'%';};
  set('perfCpu',cpu+'%','perfCpuBar',cpu);set('perfRam',ram+'%','perfRamBar',ram);set('perfDisk',disk+'%','perfDiskBar',disk);set('perfNet',net+' Mbps','perfNetBar',Math.min(net,100));
  PROCESSES.forEach(p=>{const el=document.getElementById('cpu-'+p.pid);if(el)el.textContent=(Math.random()*3).toFixed(1);});
}
function startPerfMonitor() {
  setInterval(()=>{if(state.windows['taskManager']&&!state.windows['taskManager'].minimized&&state.taskManTab==='performance')updatePerfStats();},2000);
}

/* ============================================================
   PAINT
   ============================================================ */

function buildPaint() {
  const colors=['#42a5f5','#ef5350','#66bb6a','#ffca28','#ab47bc','#26c6da','#ff7043','#ffffff','#000000','#546e8a'];
  return `
  <div class="paint-wrap">
    <div class="paint-toolbar">
      <button class="paint-tool-btn active" id="pt-pen"    onclick="setPaintTool('pen')"    title="Pen"><i class="fa-solid fa-pen"></i></button>
      <button class="paint-tool-btn"         id="pt-brush"  onclick="setPaintTool('brush')"  title="Brush"><i class="fa-solid fa-paintbrush"></i></button>
      <button class="paint-tool-btn"         id="pt-eraser" onclick="setPaintTool('eraser')" title="Eraser"><i class="fa-solid fa-eraser"></i></button>
      <button class="paint-tool-btn"         id="pt-line"   onclick="setPaintTool('line')"   title="Line"><i class="fa-solid fa-minus"></i></button>
      <button class="paint-tool-btn"         id="pt-rect"   onclick="setPaintTool('rect')"   title="Rect"><i class="fa-regular fa-square"></i></button>
      <button class="paint-tool-btn"         id="pt-circle" onclick="setPaintTool('circle')" title="Ellipse"><i class="fa-regular fa-circle"></i></button>
      <div class="color-picker-wrap">
        ${colors.map(c=>`<div class="paint-color-swatch${c===state.paintColor?' active':''}" style="background:${c}" onclick="setPaintColor('${c}')"></div>`).join('')}
        <input type="color" id="customColor" onchange="setPaintColor(this.value)" style="width:22px;height:22px;border-radius:50%;border:none;cursor:pointer;background:transparent"/>
      </div>
      <input type="range" class="size-slider" id="brushSize" min="1" max="40" value="${state.paintSize}" oninput="setPaintSize(this.value)"/>
      <span style="font-size:0.75rem;color:var(--text-dim)" id="paintSizeLabel">${state.paintSize}px</span>
      <button class="paint-tool-btn" onclick="clearCanvas()" title="Clear"><i class="fa-solid fa-trash"></i></button>
      <button class="paint-tool-btn" onclick="savePaintCanvas()" title="Save to Files + Download"><i class="fa-solid fa-floppy-disk"></i></button>
    </div>
    <div class="paint-canvas-wrap" id="paintCanvasWrap"><canvas id="paintCanvas"></canvas></div>
  </div>`;
}

let paintSnapshot=null;
function initPaintCanvas() {
  const wrap=document.getElementById('paintCanvasWrap'),canvas=document.getElementById('paintCanvas'); if(!canvas||!wrap)return;
  canvas.width=wrap.offsetWidth-4; canvas.height=wrap.offsetHeight-4;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#0d1c33'; ctx.fillRect(0,0,canvas.width,canvas.height);
  canvas.addEventListener('mousedown',e=>{state.paintDrawing=true;paintStart(e,canvas,ctx);});
  canvas.addEventListener('mousemove',e=>{if(state.paintDrawing)paintMove(e,canvas,ctx);});
  canvas.addEventListener('mouseup',  e=>{state.paintDrawing=false;paintEnd(e,canvas,ctx);});
  canvas.addEventListener('mouseleave',()=>{state.paintDrawing=false;});
}
function paintStart(e,canvas,ctx) {
  const r=canvas.getBoundingClientRect(); state.paintLastX=e.clientX-r.left; state.paintLastY=e.clientY-r.top;
  paintSnapshot=ctx.getImageData(0,0,canvas.width,canvas.height);
  if(['pen','brush'].includes(state.paintTool)){ctx.beginPath();ctx.moveTo(state.paintLastX,state.paintLastY);}
}
function paintMove(e,canvas,ctx) {
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(['pen','brush'].includes(state.paintTool)){
    ctx.strokeStyle=state.paintColor;ctx.lineWidth=state.paintTool==='brush'?state.paintSize*3:state.paintSize;ctx.lineCap='round';ctx.globalAlpha=state.paintTool==='brush'?.5:1;
    ctx.lineTo(x,y);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);
  }else if(state.paintTool==='eraser'){
    ctx.clearRect(x-state.paintSize,y-state.paintSize,state.paintSize*2,state.paintSize*2);
  }else{
    ctx.putImageData(paintSnapshot,0,0);ctx.globalAlpha=1;
    ctx.strokeStyle=state.paintColor;ctx.lineWidth=state.paintSize;ctx.lineCap='round';ctx.beginPath();
    if(state.paintTool==='line'){ctx.moveTo(state.paintLastX,state.paintLastY);ctx.lineTo(x,y);ctx.stroke();}
    else if(state.paintTool==='rect'){ctx.strokeRect(state.paintLastX,state.paintLastY,x-state.paintLastX,y-state.paintLastY);}
    else if(state.paintTool==='circle'){const rx=(x-state.paintLastX)/2,ry=(y-state.paintLastY)/2;ctx.ellipse(state.paintLastX+rx,state.paintLastY+ry,Math.abs(rx),Math.abs(ry),0,0,Math.PI*2);ctx.stroke();}
  }
}
function paintEnd(e,canvas,ctx){ctx.globalAlpha=1;ctx.beginPath();}
function setPaintTool(t){state.paintTool=t;document.querySelectorAll('.paint-tool-btn').forEach(b=>b.classList.remove('active'));document.getElementById('pt-'+t)?.classList.add('active');}
function setPaintColor(c){state.paintColor=c;document.querySelectorAll('.paint-color-swatch').forEach(s=>s.classList.toggle('active',s.style.background===c||s.getAttribute('style')?.includes(c)));}
function setPaintSize(v){state.paintSize=parseInt(v);const l=document.getElementById('paintSizeLabel');if(l)l.textContent=v+'px';}
function clearCanvas(){const c=document.getElementById('paintCanvas');if(!c)return;const ctx=c.getContext('2d');ctx.fillStyle='#0d1c33';ctx.fillRect(0,0,c.width,c.height);}
function savePaintCanvas(){
  const canvas=document.getElementById('paintCanvas'); if(!canvas)return;
  const dataUrl=canvas.toDataURL('image/png');
  const ts=Date.now();
  VFS.createFile(`paint_${ts}.png`,'Pictures',`[Canvas snapshot — ${canvas.width}x${canvas.height}px]`);
  const a=document.createElement('a'); a.href=dataUrl; a.download=`aquaos-paint-${ts}.png`; a.click();
  showToast('Saved to Pictures & downloaded!','success'); refreshExplorer();
}

/* ============================================================
   INIT
   ============================================================ */

window.addEventListener('DOMContentLoaded', () => {
  if (IS_LOGIN)   initLogin();
  if (IS_DESKTOP) initDesktop();
});
