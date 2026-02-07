const API = "/api";

// --- Navigation ---
function showView(id){
  document.querySelectorAll('.view-section').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
}

// --- Audio Preview ---
const tracks = {};
function togglePlay(id, url){
  if(!tracks[id]){
    tracks[id] = WaveSurfer.create({
      container:'#'+id, waveColor:'#4b5563', progressColor:'#37d0ff', height:50, barWidth:2
    });
    tracks[id].load(url); tracks[id].on('ready',()=>tracks[id].play());
  } else { tracks[id].playPause(); }
}

// --- Upload Files ---
function handleFileUpload(files){
  if(!files[0]) return;
  const form = new FormData();
  form.append('file', files[0]);
  fetch(API+'/upload',{method:'POST',body:form}).then(r=>r.json()).then(d=>alert(d.filename+' uploaded'));
}

// --- Membership / Stripe Stub ---
function subscribe(plan){
  fetch(API+'/stripe/subscribe',{method:'POST'}).then(r=>r.json()).then(d=>window.location.href=d.url);
}

// --- Chart ---
let revenueChart;
function initChart(){
  const ctx = document.getElementById('revenueChart').getContext('2d');
  if(revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx,{type:'line',data:{labels:['Jan1','Jan8','Jan15','Jan22','Jan30'],datasets:[{label:'Revenue',data:[120,450,300,900,1428],borderColor:'#37d0ff',backgroundColor:'rgba(55,208,255,0.1)',fill:true,tension:0.4,borderWidth:3}]}});
}
initChart();

// --- Theme Toggle ---
document.getElementById('themeToggle').onclick=()=>{
  document.body.classList.toggle('light');
};