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

  // General donations (footer "Chip In")
  DONATE_URL:         "#",

  // Sponsorship inquiries (business deal — email, not checkout)
  SPONSOR_EMAIL:      "sponsorship@grunionrugby.org",

  // Giving conversations (The '78 Club "Start a Conversation")
  GIVING_NAME:        "Josh Timpe",
  GIVING_EMAIL:       "Treasurer@SBRFC.com",
  GIVING_PHONE:       "",

  // Legal
  EIN:                "93-4659131",

  // ---------------------------------------------------------------
  // THE '78 CLUB — MEMBERS LIBRARY (members.html)
  // Photos + documents pulled live from a shared Google Drive folder.
  // See the "Members Library — Google setup" walkthrough for how to get
  // these values. Leave any value "" and that part shows a friendly
  // "not connected yet" state — nothing looks broken.
  //
  // One read-only Google Drive API key (restricted to the Drive API):
  MEMBERS_DRIVE_API_KEY:           "19oPNqh96-WQINhEHmshhGiljlqcjLBsj",
  //
  // The four folder IDs. A folder's ID is the long code in its URL when
  // you open it in Drive: drive.google.com/drive/folders/THIS_PART_HERE
  //   • DOCS  = the TOP-LEVEL shared folder. PDFs / Word docs go loose in here.
  //   • the three season sub-folders live inside it; photos go in these.
  MEMBERS_DRIVE_DOCS_FOLDER_ID:    "18u1BehBRJyhk9b9tOKaUhZQpQhuiIZHj",  // top-level folder (holds the documents)
  MEMBERS_DRIVE_CURRENT_FOLDER_ID: "17QEKqr1FbUFtinEVDKmHhyhj0APBUsBK",  // "Current Season" sub-folder
  MEMBERS_DRIVE_PRIOR_FOLDER_ID:   "1egjcuVHrw_aaraITJD9pJllfo1gsw3Ki",  // "Prior Season" sub-folder
  MEMBERS_DRIVE_LEGACY_FOLDER_ID:  "1HgGxrtE4oqlNix6Rc1hyogaLCaom1ltd",  // "Legacy Photos" sub-folder

  // Where the "Members Area" button (on the '78 Club page) points.
  // Leave as "members.html" — the in-site members library page.
  MEMBERS_AREA_URL:   "members.html"
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

/* ============================ HISTORY ASIDE — ARCHIVE SLIDESHOW ============================ */
/* Cross-fades through assets/history-1.jpg … history-3.jpg. Each file is probed first;
   only files that actually exist become slides. If none exist, the labeled green
   placeholder stays put — so the section never looks broken. To change the photos,
   just overwrite history-1.jpg / history-2.jpg / history-3.jpg in assets/. */
(function(){
  var box=document.getElementById('hofSlideshow');
  if(!box) return;
  var urls=(box.getAttribute('data-slideshow')||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  if(!urls.length) return;

  var slides=[], loaded=0, total=urls.length;
  urls.forEach(function(url){
    var probe=new Image();
    probe.onload=function(){
      var s=document.createElement('div');
      s.className='ph photo hof-slide';
      s.style.backgroundImage="url('"+url+"')";
      slides.push(s);
      done();
    };
    probe.onerror=done;
    probe.src=url;
  });

  function done(){
    loaded++;
    if(loaded<total) return;       // wait until every file resolved
    if(!slides.length) return;     // none exist — keep the placeholder
    // swap the placeholder for the real slides
    box.innerHTML='';
    slides.forEach(function(s){ box.appendChild(s); });

    var dots=null, i=0;
    if(slides.length>1){
      dots=document.createElement('div');
      dots.className='hof-dots';
      slides.forEach(function(_,idx){
        var d=document.createElement('button');
        d.type='button'; d.setAttribute('aria-label','Show photo '+(idx+1));
        d.addEventListener('click', function(){ show(idx); });
        dots.appendChild(d);
      });
      box.appendChild(dots);
    }

    function show(n){
      i=n;
      slides.forEach(function(s,idx){ s.classList.toggle('is-on', idx===i); });
      if(dots) dots.querySelectorAll('button').forEach(function(b,idx){ b.setAttribute('aria-current', idx===i?'true':'false'); });
    }
    show(0);

    if(slides.length>1){
      var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
      if(!reduce) setInterval(function(){ show((i+1)%slides.length); }, 4500);
    }
  }
})();

/* ============================ '78 CLUB — MEMBERS LIBRARY ============================ */
/* Lives on members.html only. Pulls photos + documents live from a shared Google
   Drive folder via the Drive API (read-only key in CONFIG).

   Drive layout (set up once, then pure drag-and-drop forever after):
     TOP-LEVEL FOLDER  ......  PDFs / Word docs go loose in here → "Documents" list
       ├─ Current Season  ...  photos → "Current Season" grid
       ├─ Prior Season    ...  photos → "Prior Season" grid
       └─ Legacy Photos   ...  photos → "Legacy Photos" grid

   Each season you just move files down a level in Drive (Current→Prior→Legacy).
   No edits to this file or members.html — the folder IDs and labels never change.

   If the API key or a folder ID is blank, that section shows a calm "not
   connected yet" message instead of a broken grid. */
(function(){
  var galleryHost = document.getElementById('memberGallery');
  var docsHost    = document.getElementById('memberDocs');
  if(!galleryHost && !docsHost) return;   // only on members.html

  var KEY = CONFIG.MEMBERS_DRIVE_API_KEY;

  // map each gallery section to its CONFIG folder id, by the section's data-folder-grid
  var FOLDERS = {
    'Current Season': CONFIG.MEMBERS_DRIVE_CURRENT_FOLDER_ID,
    'Prior Season':   CONFIG.MEMBERS_DRIVE_PRIOR_FOLDER_ID,
    'Legacy Photos':  CONFIG.MEMBERS_DRIVE_LEGACY_FOLDER_ID
  };

  /* ---------- PHOTO GALLERIES ---------- */
  if(galleryHost){
    var totalPhotos = 0, gridsPending = 0, gridsDone = 0;
    var grids = galleryHost.querySelectorAll('[data-folder-grid]');

    grids.forEach(function(grid){
      var label = grid.getAttribute('data-folder-grid');
      var fid   = FOLDERS[label];
      var metaEl = grid.closest('.member-folder').querySelector('[data-folder-count]');

      if(!KEY || !fid){
        emptyGrid(grid, metaEl, 'Not connected yet', 'Add this folder\u2019s ID in the site settings to show its photos here.');
        return;
      }
      gridsPending++;
      listImages(fid, function(err, files){
        gridsDone++;
        if(err){ emptyGrid(grid, metaEl, 'Couldn\u2019t load', 'This folder couldn\u2019t be reached just now. Try a refresh.'); finishCount(); return; }
        if(!files.length){ emptyGrid(grid, metaEl, 'No photos yet', 'Photos dropped into this Drive folder will appear here automatically.'); finishCount(); return; }
        renderPhotos(grid, files);
        totalPhotos += files.length;
        if(metaEl) metaEl.textContent = files.length + (files.length===1?' photo':' photos');
        finishCount();
      });
    });

    function finishCount(){
      if(gridsPending && gridsDone>=gridsPending){
        var c=document.getElementById('memberGalleryCount');
        if(c && totalPhotos) c.textContent = totalPhotos + (totalPhotos===1?' photo':' photos');
      }
    }
  }

  /* ---------- DOCUMENTS ---------- */
  if(docsHost){
    var DOCS_FID = CONFIG.MEMBERS_DRIVE_DOCS_FOLDER_ID;
    if(!KEY || !DOCS_FID){
      emptyDocs('Not connected yet', 'Add the shared folder\u2019s ID in the site settings to show documents here.');
    } else {
      listDocs(DOCS_FID, function(err, files){
        if(err){ emptyDocs('Couldn\u2019t load', 'The documents folder couldn\u2019t be reached just now. Try a refresh.'); return; }
        if(!files.length){ emptyDocs('No documents yet', 'PDFs and Word files added to the shared Drive folder will appear here automatically.'); return; }
        renderDocs(files);
        var c=document.getElementById('memberDocsCount');
        if(c) c.textContent = files.length + (files.length===1?' file':' files');
      });
    }
  }

  /* ---------- Drive API calls ---------- */
  // images in a folder, newest first
  function listImages(folderId, cb){
    var q = "'"+folderId+"' in parents and mimeType contains 'image/' and trashed=false";
    driveList(q, 'files(id,name,thumbnailLink,imageMediaMetadata)', cb);
  }
  // PDFs + Word docs in a folder, newest first
  function listDocs(folderId, cb){
    var q = "'"+folderId+"' in parents and trashed=false and ("+
            "mimeType='application/pdf' or "+
            "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or "+
            "mimeType='application/msword')";
    driveList(q, 'files(id,name,mimeType,modifiedTime)', cb);
  }
  function driveList(q, fields, cb){
    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent(q)
      + '&orderBy=' + encodeURIComponent('modifiedTime desc')
      + '&pageSize=200'
      + '&fields=' + encodeURIComponent(fields)
      + '&key=' + encodeURIComponent(KEY);
    fetch(url).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){ cb(null, (j && j.files) || []); })
      .catch(function(){ cb(true, null); });
  }

  /* ---------- renderers ---------- */
  function renderPhotos(grid, files){
    grid.innerHTML='';
    files.forEach(function(f){
      var full = 'https://drive.google.com/uc?export=view&id=' + f.id;
      var thumb = f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s600') : full;
      var a=document.createElement('a');
      a.className='member-photo';
      a.href=full; a.target='_blank'; a.rel='noopener';
      a.setAttribute('role','listitem');
      a.setAttribute('aria-label','Open photo: '+(f.name||'photo'));
      var img=document.createElement('img');
      img.loading='lazy'; img.src=thumb; img.alt=cleanName(f.name)||'Club photo';
      img.onerror=function(){ a.remove(); };
      a.appendChild(img);
      var open=document.createElement('span'); open.className='mp-open'; open.setAttribute('aria-hidden','true'); open.textContent='\u2197';
      a.appendChild(open);
      grid.appendChild(a);
    });
  }

  function renderDocs(files){
    docsHost.innerHTML='';
    files.forEach(function(f){
      var type = (f.mimeType==='application/pdf') ? 'PDF' : 'DOC';
      var a=document.createElement('a');
      a.className='member-doc';
      a.setAttribute('data-type', type);
      a.setAttribute('role','listitem');
      a.href='https://drive.google.com/uc?export=download&id=' + f.id;
      a.target='_blank'; a.rel='noopener';
      a.setAttribute('aria-label','Download '+(f.name||'document'));

      var icon=document.createElement('span'); icon.className='md-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent=type;
      var main=document.createElement('span'); main.className='md-main';
      var title=document.createElement('span'); title.className='md-title'; title.textContent=cleanName(f.name)||'Document';
      var meta=document.createElement('span'); meta.className='md-meta';
      var tag=document.createElement('span'); tag.className='md-type'; tag.textContent=type;
      meta.appendChild(tag);
      if(f.modifiedTime){
        var note=document.createElement('span'); note.className='md-note'; note.textContent='Updated '+fmtModified(f.modifiedTime);
        meta.appendChild(note);
      }
      main.appendChild(title); main.appendChild(meta);
      var dl=document.createElement('span'); dl.className='md-dl'; dl.textContent='Download';

      a.appendChild(icon); a.appendChild(main); a.appendChild(dl);
      docsHost.appendChild(a);
    });
  }

  /* ---------- empty / fallback states ---------- */
  function emptyGrid(grid, metaEl, label, sub){
    grid.innerHTML =
      '<div class="member-gallery-loading">'+
        '<span class="gl-label">'+esc(label)+'</span>'+
        '<span class="gl-sub">'+esc(sub)+'</span>'+
      '</div>';
    if(metaEl) metaEl.textContent='';
  }
  function emptyDocs(label, sub){
    docsHost.innerHTML =
      '<div class="member-doc-loading">'+
        '<span class="dl-dot" aria-hidden="true"></span>'+
        '<span>'+esc(label)+' \u2014 '+esc(sub)+'</span>'+
      '</div>';
  }

  /* ---------- helpers ---------- */
  function cleanName(n){
    if(!n) return '';
    return n.replace(/\.(jpe?g|png|gif|webp|heic|pdf|docx?|)$/i,'').replace(/[_-]+/g,' ').trim();
  }
  function fmtModified(iso){
    var d=new Date(iso); if(isNaN(d)) return '';
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
})();
