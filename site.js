/* =================================================================
   CONFIG — every "connect later" value lives here. Edit and re-save.
   ================================================================= */
var CONFIG = {
  // Match Centre: paste the PUBLISHED Google Sheet CSV URL.
  // File ▸ Share ▸ Publish to web ▸ choose the sheet ▸ Comma-separated values (.csv).
  // Columns (header row, any order): Season, Date, Opponent, Competition, Location, Status, GrunionScore, OpponentScore
  // Leave "" to show the built-in sample fixtures below.
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRRlKXYhf97sQcT0SKa_91oXBuJv_dmYm3m_5k5Jp7Df49Fm3HuQbRML14GlEsETyNgoWeZNLKBMelv/pub?gid=0&single=true&output=csv",

  // The '78 Club patron roster: paste a PUBLISHED Google Doc OR Google Sheet URL.
  //  • Google Doc:  File ▸ Share ▸ Publish to web ▸ copy the link. In the doc, put each
  //    tier name on its own line (Founders' XV / Reserves / Supporters' Union) and list
  //    that tier's patrons on the lines beneath it — one name per line.
  //  • Google Sheet: File ▸ Share ▸ Publish to web ▸ .csv. Two columns — Tier, Name.
  //    (A published Sheet is the most reliable source.)
  // Leave "" to keep the "YOUR NAME HERE" placeholders on the wall.
  PATRONS_DOC_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRRlKXYhf97sQcT0SKa_91oXBuJv_dmYm3m_5k5Jp7Df49Fm3HuQbRML14GlEsETyNgoWeZNLKBMelv/pub?gid=299262421&single=true&output=csv",

  // Newsletter: paste your Mailchimp / Buttondown form-action URL.
  // Leave "" for a graceful "saved locally" confirmation message.
  NEWSLETTER_ACTION_URL: "",

  // The '78 Club — Legacy Donor program
  JOIN_78_URL:        "#",   // payment / registration link
  MEMBERS_AREA_URL:   "#",   // gated members portal link

  // General donations (footer "Chip In")
  DONATE_URL:         "#",

  // Sponsorship inquiries (business deal — email, not checkout)
  SPONSOR_EMAIL:      "sponsorship@grunionrugby.org",

  // Giving conversations (The '78 Club "Start a Conversation")
  GIVING_NAME:        "Josh Timpe",
  GIVING_EMAIL:       "Treasurer@SBRFC.com",
  GIVING_PHONE:       "",

  // Legal
  EIN:                "93-4659131"
};

/* ---------- apply CONFIG to the page ---------- */
(function applyConfig(){
  document.getElementById('year').textContent = new Date().getFullYear();

  // EIN everywhere
  document.querySelectorAll('[data-ein]').forEach(function(el){
    if(CONFIG.EIN && CONFIG.EIN.indexOf('XX')===-1) el.textContent = CONFIG.EIN;
  });
  // giving contact
  setText('[data-giving-name]', CONFIG.GIVING_NAME, '[Contact Name]');
  setText('[data-giving-email]', CONFIG.GIVING_EMAIL, '[email]');
  setText('[data-giving-phone]', CONFIG.GIVING_PHONE, '[phone]');

  // wire data-link buttons
  document.querySelectorAll('[data-link]').forEach(function(a){
    var key = a.getAttribute('data-link');
    if(key==='join78')  setHref(a, CONFIG.JOIN_78_URL);
    if(key==='members') setHref(a, CONFIG.MEMBERS_AREA_URL);
    if(key==='donate')  setHref(a, CONFIG.DONATE_URL);
    if(key==='sponsorMail'){
      a.href = 'mailto:'+CONFIG.SPONSOR_EMAIL+'?subject='+encodeURIComponent('Grunion Sponsorship');
    }
    if(key==='givingEmail'){
      var em = (CONFIG.GIVING_EMAIL && CONFIG.GIVING_EMAIL.indexOf('[')===-1) ? CONFIG.GIVING_EMAIL : CONFIG.SPONSOR_EMAIL;
      a.href = 'mailto:'+em+'?subject='+encodeURIComponent('The \'78 Club — Giving Conversation');
    }
  });
  function setHref(a,url){ if(url && url!=='#'){ a.href=url; if(url.indexOf('http')===0){a.target='_blank';a.rel='noopener';} } }
  function setText(sel,val,ph){ document.querySelectorAll(sel).forEach(function(el){ if(val && val!==ph && val.indexOf('[')===-1) el.textContent=val; }); }
})();

/* ---------- header: solid on scroll + mobile nav ---------- */
(function(){
  var head=document.getElementById('siteHead'), burger=document.getElementById('burger');
  function onScroll(){ head.classList.toggle('solid', window.scrollY>20); }
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});
  burger.addEventListener('click', function(){
    var open = head.classList.toggle('open');
    burger.setAttribute('aria-expanded', open?'true':'false');
  });
  document.getElementById('navLinks').addEventListener('click', function(e){
    if(e.target.tagName==='A'){ head.classList.remove('open'); burger.setAttribute('aria-expanded','false'); }
  });
})();

/* ---------- hero variant via ?hero=fullbleed|split|duotone ---------- */
(function(){
  var v = new URLSearchParams(location.search).get('hero');
  if(v==='split'||v==='duotone'||v==='fullbleed') document.body.setAttribute('data-hero', v);
})();

/* ---------- newsletter form ---------- */
(function(){
  var form=document.getElementById('nlForm'), msg=document.getElementById('nlMsg'), input=document.getElementById('nlEmail');
  if(!form) return; // newsletter form lives on the homepage only
  if(CONFIG.NEWSLETTER_ACTION_URL){ form.action=CONFIG.NEWSLETTER_ACTION_URL; form.method='post'; }
  form.addEventListener('submit', function(e){
    var ok = input.checkValidity() && input.value.indexOf('@')>0;
    if(!ok){ e.preventDefault(); msg.textContent='Please enter a valid email address.'; return; }
    if(!CONFIG.NEWSLETTER_ACTION_URL){
      e.preventDefault();
      msg.textContent='Thanks — you’re on the list once the Dispatch goes live.';
      form.reset();
    }
    /* else: native POST to the configured provider */
  });
})();

/* ============================ MATCH CENTRE ============================ */
(function(){
  var listEl=document.getElementById('mcList'),
      toggleEl=document.getElementById('seasonToggle'),
      metaEl=document.getElementById('mcMeta');
  if(!listEl) return; // Match Centre lives on the homepage only

  // built-in sample fixtures — shown until SHEET_CSV_URL is set. SWAP via the sheet.
  var SAMPLE = [
    {Season:'2024–25', Division:'SoCal Division 3', Date:'2025-04-12', Opponent:'Ventura',        Competition:'SoCal D3', Location:'Home', Status:'Result', GrunionScore:'31', OpponentScore:'17'},
    {Season:'2024–25', Division:'SoCal Division 3', Date:'2025-03-22', Opponent:'Kern County',    Competition:'SoCal D3', Location:'Away', Status:'Result', GrunionScore:'19', OpponentScore:'24'},
    {Season:'2024–25', Division:'SoCal Division 3', Date:'2025-03-08', Opponent:'San Luis Obispo',Competition:'SoCal D3', Location:'Home', Status:'Result', GrunionScore:'27', OpponentScore:'27'},
    {Season:'2024–25', Division:'SoCal Division 3', Date:'2025-02-15', Opponent:'Santa Monica',   Competition:'SoCal D3', Location:'Away', Status:'Result', GrunionScore:'22', OpponentScore:'10'},
    {Season:'2024–25', Division:'SoCal Division 3', Date:'2025-05-03', Opponent:'Bakersfield',    Competition:'Playoff',  Location:'Home', Status:'Upcoming', GrunionScore:'', OpponentScore:''},
    {Season:'2023–24', Division:'SoCal Division 3', Date:'2024-04-06', Opponent:'Ventura',        Competition:'SoCal D3', Location:'Away', Status:'Result', GrunionScore:'15', OpponentScore:'29'},
    {Season:'2023–24', Division:'SoCal Division 3', Date:'2024-03-16', Opponent:'Santa Monica',   Competition:'SoCal D3', Location:'Home', Status:'Result', GrunionScore:'33', OpponentScore:'12'},
    {Season:'2023–24', Division:'SoCal Division 3', Date:'2024-02-24', Opponent:'Kern County',    Competition:'SoCal D3', Location:'Home', Status:'Result', GrunionScore:'20', OpponentScore:'20'}
  ];

  var isSample=true;

  function start(){
    if(CONFIG.SHEET_CSV_URL){
      fetch(CONFIG.SHEET_CSV_URL).then(function(r){ if(!r.ok) throw 0; return r.text(); })
        .then(function(txt){ var rows=parseCSV(txt); if(rows.length){ isSample=false; render(rows); } else { render(SAMPLE); } })
        .catch(function(){ render(SAMPLE); });
    } else {
      render(SAMPLE);
    }
  }

  function parseCSV(text){
    var lines=text.replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length;});
    if(lines.length<2) return [];
    var headers=splitLine(lines[0]).map(function(h){return h.trim().toLowerCase();});
    var map={season:'Season',division:'Division',date:'Date',opponent:'Opponent',competition:'Competition',location:'Location',status:'Status',grunionscore:'GrunionScore',opponentscore:'OpponentScore'};
    var out=[];
    for(var i=1;i<lines.length;i++){
      var cells=splitLine(lines[i]); var o={};
      headers.forEach(function(h,idx){ var key=map[h.replace(/[^a-z]/g,'')]; if(key) o[key]=(cells[idx]||'').trim(); });
      if(o.Opponent||o.Date) out.push(o);
    }
    return out;
  }
  function splitLine(line){
    var res=[],cur='',q=false;
    for(var i=0;i<line.length;i++){var c=line[i];
      if(c==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; }
      else if(c===','&&!q){res.push(cur);cur='';}
      else cur+=c;
    }
    res.push(cur); return res;
  }

  function seasonsOf(rows){
    var s=[]; rows.forEach(function(r){ if(r.Season && s.indexOf(r.Season)===-1) s.push(r.Season); });
    s.sort().reverse(); return s;
  }
  function fmtDate(d){
    var dt=new Date(d); if(isNaN(dt)) return d||'';
    return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  function result(r){
    if((r.Status||'').toLowerCase().indexOf('up')===0 || (!r.GrunionScore&&!r.OpponentScore)){
      return {cls:'r-up', badge:'Upcoming', score:'Kickoff TBD'};
    }
    var g=parseInt(r.GrunionScore,10), o=parseInt(r.OpponentScore,10);
    var cls='r-draw', b='Draw';
    if(g>o){cls='r-win';b='Win';} else if(g<o){cls='r-loss';b='Loss';}
    return {cls:cls, badge:b, score:g+'–'+o};
  }

  function render(rows){
    var seasons=seasonsOf(rows);
    if(!seasons.length) seasons=['—'];
    // build toggle
    toggleEl.innerHTML='';
    seasons.forEach(function(s,i){
      var b=document.createElement('button');
      b.type='button'; b.textContent=s; b.setAttribute('aria-pressed', i===0?'true':'false');
      b.addEventListener('click', function(){
        toggleEl.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed','false');});
        b.setAttribute('aria-pressed','true'); paint(rows, s);
      });
      toggleEl.appendChild(b);
    });
    paint(rows, seasons[0]);
    // ticker: last result + next upcoming from full set (newest season)
    fillTicker(rows);
  }

  function paint(rows, season){
    var list=rows.filter(function(r){ return (r.Season||'—')===season; });
    list.sort(function(a,b){ return new Date(b.Date)-new Date(a.Date); });
    if(!list.length){ listEl.innerHTML='<div class="mc-state">No fixtures posted yet — check back soon.</div>'; metaEl.hidden=true; return; }
    // record line
    var w=0,l=0,d=0;
    list.forEach(function(r){ var res=result(r); if(res.cls==='r-win')w++; else if(res.cls==='r-loss')l++; else if(res.cls==='r-draw')d++; });
    metaEl.hidden=false;
    // Division label comes from the sheet's "Division" column for this season.
    // Uses the first non-empty Division value found; falls back if the column is empty.
    var division='SoCal Division 3';
    for(var di=0; di<list.length; di++){ if(list[di].Division){ division=list[di].Division; break; } }
    metaEl.innerHTML=esc(division)+' · '+w+'W–'+l+'L–'+d+'D'+(isSample?'<span class="sample-flag">Sample data — connect the sheet</span>':'');

    var html='';
    list.forEach(function(r){
      var res=result(r);
      html+='<div class="mc-row '+res.cls+'">'+
        '<div class="m-date">'+fmtDate(r.Date)+'</div>'+
        '<div class="m-opp">'+esc(r.Opponent||'TBD')+'</div>'+
        '<div class="m-comp">'+esc(r.Competition||'')+'</div>'+
        '<div class="m-loc">'+(/(^a)/i.test(r.Location||'')?'Away':'Home')+'</div>'+
        '<div class="m-res"><span class="m-score">'+res.score+'</span><span class="badge">'+res.badge+'</span></div>'+
      '</div>';
    });
    listEl.innerHTML=html;
  }

  function fillTicker(rows){
    var sorted=rows.slice().sort(function(a,b){return new Date(b.Date)-new Date(a.Date);});
    var next=sorted.filter(function(r){return result(r).cls==='r-up';}).sort(function(a,b){return new Date(a.Date)-new Date(b.Date);})[0];
    if(next){
      document.getElementById('nextOpp').textContent=next.Opponent||'TBD';
      document.getElementById('nextDate').textContent=fmtDate(next.Date);
    }
  }
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

  start();
})();

/* ---------- Facebook Page plugin (graceful: fallback stays if SDK blocked) ---------- */
(function(){
  if(!document.querySelector('.fb-page')) return; // FB plugin lives on the homepage only
  var s=document.createElement('script');
  s.async=true; s.defer=true; s.crossOrigin='anonymous';
  s.src='https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0';
  s.onload=function(){
    setTimeout(function(){
      var fb=document.querySelector('.fb-page');
      if(fb && fb.offsetHeight>60){ var fbk=document.getElementById('fbFallback'); if(fbk) fbk.style.display='none'; }
    }, 1800);
  };
  document.body.appendChild(s);
})();

/* ============================ '78 CLUB PATRON ROSTER ============================ */
/* Names on the clubhouse plaque auto-update from CONFIG.PATRONS_DOC_URL.
   Until that's connected, the "YOUR NAME HERE" placeholders stay put. */
(function(){
  var slots = document.querySelectorAll('[data-patrons-tier]');
  if(!slots.length) return;            // only on the '78 Club page
  if(!CONFIG.PATRONS_DOC_URL) return;  // not connected yet — keep placeholders

  fetch(CONFIG.PATRONS_DOC_URL).then(function(r){ if(!r.ok) throw 0; return r.text(); })
    .then(function(txt){
      var groups = parsePatrons(txt);
      slots.forEach(function(el){
        var names = groups[norm(el.getAttribute('data-patrons-tier'))];
        if(names && names.length) el.textContent = names.join(' \u00b7 ');
      });
    })
    .catch(function(){ /* unreachable source — leave placeholders */ });

  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z]/g,''); }

  function parsePatrons(text){
    text = text.replace(/\r/g,'');
    // Published Google Sheet (CSV): header row with a "Tier" column, then Tier,Name rows
    if(/(^|\n)\s*tier\s*,/i.test(text)){
      var out={}, lines=text.split('\n').filter(function(l){return l.trim();});
      for(var i=1;i<lines.length;i++){
        var c=lines[i].split(','), t=norm(c[0]), n=(c[1]||'').trim();
        if(t&&n){ (out[t]=out[t]||[]).push(n); }
      }
      return out;
    }
    // Published Google Doc (HTML export or plain text): tier headings, then names
    var tierKeys={foundersxv:1,reserves:1,supportersunion:1};
    var plain = text.indexOf('<')>-1 ? text.replace(/<[^>]+>/g,'\n') : text;
    plain = plain.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
    var rows = plain.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    var groups={}, cur=null;
    rows.forEach(function(l){
      var k=norm(l);
      if(tierKeys[k]){ cur=k; groups[cur]=groups[cur]||[]; }
      else if(cur){ groups[cur].push(l); }
    });
    return groups;
  }
})();

/* ============================ MATCH GALLERY (arrow scroll) ============================ */
(function(){
  var strip=document.getElementById('galStrip');
  if(!strip) return;

  /* Photo auto-load: each .ph[data-photo] probes for its image file.
     If the file exists, it becomes the slot's background and the placeholder label hides.
     If not, the labeled placeholder stays — so the gallery never looks broken.
     To update a photo, just upload the matching filename to assets/ (overwrite). */
  document.querySelectorAll('.ph[data-photo]').forEach(function(ph){
    var url=ph.getAttribute('data-photo');
    if(!url) return;
    var probe=new Image();
    probe.onload=function(){
      ph.style.backgroundImage="url('"+url+"')";
      ph.style.backgroundSize='cover';
      ph.style.backgroundPosition='center';
      ph.classList.add('photo');
      ph.classList.remove('green');
      var tag=ph.querySelector('.ph-tag'); if(tag) tag.style.display='none';
    };
    probe.src=url;
  });

  document.querySelectorAll('[data-gal]').forEach(function(b){
    b.addEventListener('click', function(){
      var item=strip.querySelector('.g-item');
      var dx=(item?item.offsetWidth:320)+16;
      strip.scrollBy({left:b.getAttribute('data-gal')==='next'?dx:-dx, behavior:'smooth'});
    });
  });
})();
