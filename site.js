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
  PATRONS_DOC_URL: "",

  // Hall of Fame (history.html ▸ Greatest Grunions): paste a PUBLISHED Google Sheet CSV URL.
  // File ▸ Share ▸ Publish to web ▸ choose the "Hall of Fame" sheet ▸ Comma-separated values (.csv).
  // Two columns (header row): Name, Year  — Year is the first year with the Grunions (e.g. 78),
  // and may be left blank. Rows render in sheet order, top to bottom.
  // Leave "" to keep the built-in list already printed on the page.
  HOF_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRRlKXYhf97sQcT0SKa_91oXBuJv_dmYm3m_5k5Jp7Df49Fm3HuQbRML14GlEsETyNgoWeZNLKBMelv/pub?gid=1804498175&single=true&output=csv",

  // Newsletter: handled by Campaign Monitor's embedded form (markup + script
  // live in index.html). Subscribers go straight to the MER List.

  // The '78 Club — Legacy Donor program
  JOIN_78_URL:        "#",   // payment / registration link

  // General donations (footer "Chip In") — Zeffy donation form (opens in a new tab)
  DONATE_URL:         "https://www.zeffy.com/en-US/donation-form/grunion-rfc",

  // Sponsorship inquiries (business deal — email, not checkout)
  SPONSOR_EMAIL:      "sponsorship@grunionrugby.org",

  // Giving conversations (The '78 Club "Start a Conversation")
  GIVING_NAME:        "Josh Timpe",
  GIVING_EMAIL:       "Treasurer@SBRFC.com",
  GIVING_PHONE:       "",

  // Legal
  EIN:                "93-4659131",

  // ---------------------------------------------------------------
  // THE '78 CLUB — THE MERchives (MERchives.html)
  // Photos + documents pulled live from a shared Google Drive folder.
  // See the "Members Library — Google setup" walkthrough for how to get
  // these values. Leave any value "" and that part shows a friendly
  // "not connected yet" state — nothing looks broken.
  //
  // One read-only Google Drive API key (restricted to the Drive API):
  MEMBERS_DRIVE_API_KEY:           "AIzaSyAV74KmGRq3dJANP7uSq2_VKGMlZ1sMlOI",
  //
  // Folder IDs. A folder's ID is the long code in its URL when you open
  // it in Drive: drive.google.com/drive/folders/THIS_PART_HERE
  //   • ROOT = the TOP-LEVEL shared "MERchives" folder. Photo sub-folders
  //     live inside it and are DISCOVERED AUTOMATICALLY — add / rename /
  //     remove folders in Drive and the archive page updates itself.
  //   • DOCS = the "Documents" sub-folder inside it. PDFs / Word docs go
  //     loose in here → the "Documents" list. (It's excluded from the
  //     photo tiles automatically.)
  //   • CURRENT is only used by the home-page "match gallery" strip, which
  //     pulls a few random shots from the Current Season folder.
  MEMBERS_DRIVE_ROOT_FOLDER_ID:    "18u1BehBRJyhk9b9tOKaUhZQpQhuiIZHj",  // top-level "MERchives" folder
  MEMBERS_DRIVE_DOCS_FOLDER_ID:    "19oPNqh96-WQINhEHmshhGiljlqcjLBsj",  // "Documents" sub-folder
  MEMBERS_DRIVE_CURRENT_FOLDER_ID: "17QEKqr1FbUFtinEVDKmHhyhj0APBUsBK",  // "Current Season" sub-folder (home page only)

  // Where any MERchives link points — the in-site archive page.
  MEMBERS_AREA_URL:   "MERchives.html"
};

/* ---------- apply CONFIG to the page ---------- */
(function applyConfig(){
  var yearEl=document.getElementById('year');
  if(yearEl) yearEl.textContent = new Date().getFullYear(); // not every page has a footer year

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

/* ---------- newsletter form ----------
   Handled entirely by Campaign Monitor's embedded-form script
   (copypastesubscribeformlogic.js, loaded in index.html). It validates
   the email and submits directly to the MER List — no code needed here. */

/* ---------- newsletter archive (past issues) ---------- */
/* The Campaign Monitor script in index.html document.writes one
   <div class="campaign">DATE — <a href>NAME</a></div> per sent issue.
   This restyles each into a document-style row (icon / title / date / read link).
   If the markup ever changes, parsing fails safely and the raw list stays visible. */
(function(){
  var list=document.getElementById('nlArchiveList');
  if(!list) return; // archive lives on the homepage only
  function enhance(){
    var items=list.querySelectorAll('div.campaign');
    if(!items.length){
      // script blocked or no campaigns sent yet — show a quiet note
      if(!list.querySelector('.nl-archive-empty') && !list.querySelector('.nl-issue')){
        var empty=document.createElement('p');
        empty.className='nl-archive-empty';
        empty.textContent='The archive is temporarily becalmed. Subscribe above and stand by; the next MerMers will surface when the Fish get their act together.';
        list.appendChild(empty);
      }
      return;
    }
    items.forEach(function(item){
      var link=item.querySelector('a');
      if(!link) return; // leave unrecognized markup untouched
      // date = the campaign div's text minus the link text and separator dashes
      var date=(item.textContent||'').replace(link.textContent||'',
        '').replace(/[–—-]\s*$/,'').replace(/^\s*[–—-]/,'').trim();
      var row=document.createElement('a');
      row.className='nl-issue';
      row.href=link.href;
      row.target='_blank'; row.rel='noopener';
      row.innerHTML='<span class="nli-icon" aria-hidden="true">MER</span>'+
        '<span class="nli-main"><span class="nli-title"></span>'+
        (date?'<span class="nli-date"></span>':'')+'</span>'+
        '<span class="nli-read">Read</span>';
      row.querySelector('.nli-title').textContent=link.textContent||'Untitled issue';
      if(date) row.querySelector('.nli-date').textContent=date;
      item.replaceWith(row);
    });
  }
  // the archive script is synchronous document.write, so its output exists by
  // DOMContentLoaded; run now if ready, otherwise wait.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
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
      // Google's published-CSV endpoint can be slow (1–10s). Render the last-seen
      // sheet from localStorage instantly, then fetch fresh data in the background
      // and only re-render if it actually changed.
      var CACHE_KEY='grunion-fixtures-csv', cached=null;
      try{ cached=localStorage.getItem(CACHE_KEY); }catch(e){}
      if(cached){
        var cachedRows=parseCSV(cached);
        if(cachedRows.length){ isSample=false; render(cachedRows); } else { cached=null; }
      }
      fetch(CONFIG.SHEET_CSV_URL).then(function(r){ if(!r.ok) throw 0; return r.text(); })
        .then(function(txt){
          var rows=parseCSV(txt);
          if(rows.length){
            isSample=false;
            try{ localStorage.setItem(CACHE_KEY, txt); }catch(e){}
            if(txt!==cached) render(rows); // unchanged data → don't reset the season toggle
          } else if(!cached){
            render(SAMPLE);
          }
        })
        .catch(function(){ if(!cached) render(SAMPLE); });
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
  // Parse dates as LOCAL time. new Date('2025-04-12') is treated as UTC midnight,
  // which displays as the previous day in California — so YYYY-MM-DD is parsed by hand.
  function parseDate(d){
    if(!d) return new Date(NaN);
    var m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(d).trim());
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
    return new Date(d);
  }
  function fmtDate(d){
    var dt=parseDate(d); if(isNaN(dt)) return d||'';
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
    list.sort(function(a,b){ return parseDate(b.Date)-parseDate(a.Date); });
    if(!list.length){ listEl.innerHTML='<div class="mc-state">No fixtures posted yet — check back soon.</div>'; metaEl.hidden=true; return; }
    // record line
    var w=0,l=0,d=0;
    list.forEach(function(r){ var res=result(r); if(res.cls==='r-win')w++; else if(res.cls==='r-loss')l++; else if(res.cls==='r-draw')d++; });
metaEl.hidden=false;
    // Division label comes from the sheet's "Division" column for this season (if present).
    var division='';
    for(var di=0; di<list.length; di++){ if(list[di].Division){ division=list[di].Division; break; } }
    metaEl.innerHTML=(division?esc(division)+' · ':'')+w+'W–'+l+'L–'+d+'D'+(isSample?'<span class="sample-flag">Sample data — connect the sheet</span>':'');

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
    // Compare against today's date (local midnight) so LAST/NEXT track the calendar,
    // not just the sheet's Status column.
    var today=new Date(); today.setHours(0,0,0,0);
    function dayOf(r){ var d=parseDate(r.Date); if(isNaN(d)) return null; d.setHours(0,0,0,0); return d; }
    function played(r){ return result(r).cls!=='r-up'; } // has a final score

    // LAST = most recent game that has been played and is on/before today.
    var last=rows.filter(function(r){ var d=dayOf(r); return d && played(r) && d<=today; })
                 .sort(function(a,b){ return dayOf(b)-dayOf(a); })[0];
    var lastScoreEl=document.getElementById('lastScore'),
        lastOppEl=document.getElementById('lastOpp');
    if(lastScoreEl && lastOppEl){
      if(last){ lastScoreEl.textContent=result(last).score; lastOppEl.textContent=last.Opponent||'TBD'; }
      else    { lastScoreEl.textContent='—'; lastOppEl.textContent='TBD'; }
    }

    // NEXT = next unplayed game on/after today. None left (e.g. season over) -> TBD.
    var next=rows.filter(function(r){ var d=dayOf(r); return d && !played(r) && d>=today; })
                 .sort(function(a,b){ return dayOf(a)-dayOf(b); })[0];
    var nextOppEl=document.getElementById('nextOpp'),
        nextDateEl=document.getElementById('nextDate');
    if(nextOppEl && nextDateEl){
      if(next){ nextOppEl.textContent=next.Opponent||'TBD'; nextDateEl.textContent=fmtDate(next.Date); }
      else    { nextOppEl.textContent='—'; nextDateEl.textContent='TBD'; }
    }
  }
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

  start();
})();

/* ---------- Facebook Page plugin (graceful: fallback shown only if SDK blocked) ----------
   The SDK is heavy, so it only loads once the news section scrolls near the viewport.
   The fallback starts hidden (see index.html) and is revealed only when the feed
   fails to render — blocked SDK, network error — so normal visitors see no flash. */
(function(){
  var fb=document.querySelector('.fb-page');
  if(!fb) return; // FB plugin lives on the homepage only
  var loaded=false;
  function showFallback(){ var fbk=document.getElementById('fbFallback'); if(fbk) fbk.hidden=false; }
  function loadSDK(){
    if(loaded) return; loaded=true;
    var s=document.createElement('script');
    s.async=true; s.defer=true; s.crossOrigin='anonymous';
    s.src='https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0';
    s.onload=function(){
      setTimeout(function(){
        if(fb.offsetHeight<=60) showFallback(); // SDK loaded but feed didn't render
      }, 1800);
    };
    s.onerror=showFallback; // SDK blocked or unreachable
    document.body.appendChild(s);
  }
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(entries){
      if(entries.some(function(e){return e.isIntersecting;})){ loadSDK(); io.disconnect(); }
    }, {rootMargin:'600px'});
    io.observe(fb.closest('.fb-shell')||fb);
  } else {
    loadSDK();
  }
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
    // Published Google Doc (HTML export or plain text): tier headings, then names.
    // "reserves" is kept as a legacy alias for the renamed "Second XV" tier.
    var tierKeys={foundersxv:1,secondxv:1,reserves:1,supportersunion:1};
    var plain = text.indexOf('<')>-1 ? text.replace(/<[^>]+>/g,'\n') : text;
    plain = plain.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
    var rows = plain.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    var groups={}, cur=null;
    rows.forEach(function(l){
      var k=norm(l);
      if(tierKeys[k]){ cur=k; groups[cur]=groups[cur]||[]; }
      else if(cur){ groups[cur].push(l); }
    });
    // legacy alias: a doc still using a "Reserves" heading fills the Second XV slot
    if(groups.reserves && !groups.secondxv) groups.secondxv = groups.reserves;
    return groups;
  }
})();

/* ============================ HALL OF FAME — GREATEST GRUNIONS ============================ */
/* The list on history.html auto-updates from CONFIG.HOF_CSV_URL (published Google Sheet, CSV).
   Until that's connected, the names already printed in the page stay put. */
(function(){
  var list = document.getElementById('greatsList');
  if(!list) return;                // only on the history page
  if(!CONFIG.HOF_CSV_URL) return;  // not connected yet — keep the built-in list

  fetch(CONFIG.HOF_CSV_URL).then(function(r){ if(!r.ok) throw 0; return r.text(); })
    .then(function(txt){
      var people = parseHOF(txt);
      if(!people.length) return;   // empty / unreadable — leave the built-in list
      list.innerHTML='';
      people.forEach(function(p){
        var li=document.createElement('li');
        li.textContent = p.year ? p.name+" ('"+p.year+")" : p.name;
        list.appendChild(li);
      });
    })
    .catch(function(){ /* unreachable source — leave the built-in list */ });

  function splitLine(line){
    var res=[],cur='',q=false;
    for(var i=0;i<line.length;i++){var c=line[i];
      if(c==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; }
      else if(c===','&&!q){res.push(cur);cur='';}
      else cur+=c;
    }
    res.push(cur); return res;
  }
  function parseHOF(text){
    var lines=text.replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length;});
    if(lines.length<2) return [];
    var headers=splitLine(lines[0]).map(function(h){return h.trim().toLowerCase().replace(/[^a-z]/g,'');});
    var ni=headers.indexOf('name'); var yi=headers.indexOf('year');
    if(ni===-1) ni=0;                // no header? assume column 1 is the name
    var out=[];
    for(var i=1;i<lines.length;i++){
      var cells=splitLine(lines[i]);
      var name=(cells[ni]||'').trim();
      var year=yi>-1?(cells[yi]||'').trim().replace(/^'+/,''):'';
      if(name) out.push({name:name, year:year});
    }
    return out;
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

  /* Live photos: pull 5 random shots from the MERchives "Current Season" Drive
     folder. Every page load gets a fresh random selection. If the Drive API is
     unreachable (or the folder is empty), the static slots above stay put —
     so the gallery never looks broken. */
  (function(){
    var KEY=CONFIG.MEMBERS_DRIVE_API_KEY, FID=CONFIG.MEMBERS_DRIVE_CURRENT_FOLDER_ID;
    if(!KEY || !FID) return;
    var q="'"+FID+"' in parents and mimeType contains 'image/' and trashed=false";
    var url='https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)
      +'&pageSize=200&fields='+encodeURIComponent('files(id,name,thumbnailLink)')
      +'&key='+encodeURIComponent(KEY);
    fetch(url).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){
        var files=((j&&j.files)||[]).filter(function(f){ return f.thumbnailLink; });
        if(!files.length) return;
        // Fisher–Yates shuffle
        for(var i=files.length-1;i>0;i--){
          var k=Math.floor(Math.random()*(i+1)); var t=files[i]; files[i]=files[k]; files[k]=t;
        }
        /* Google's thumbnailLink URLs (lh3.googleusercontent.com) are short-lived
           and rate-limited, so some randomly fail — and a failed CSS background
           renders as a blank white card. Fix: preload each thumbnail first, fall
           back to the stable drive.google.com/thumbnail endpoint if it fails,
           skip the file if both fail, and only swap the strip in once we have
           real, loaded images. */
        var WANT=Math.min(5,files.length), queue=files.slice(), got=[], inflight=0, done=false;

        function finish(){
          if(done) return; done=true;
          if(!got.length) return; // every thumbnail failed — keep the static gallery
          strip.innerHTML='';
          got.forEach(function(g){
            var fig=document.createElement('figure'); fig.className='g-item';
            var a=document.createElement('a');
            a.className='ph photo';
            a.href='https://drive.google.com/file/d/'+g.id+'/view';
            a.target='_blank'; a.rel='noopener';
            a.setAttribute('aria-label','Open match photo (Google Drive)');
            a.style.backgroundImage="url('"+g.src+"')";
            fig.appendChild(a);
            strip.appendChild(fig);
          });
        }

        function load(f){
          inflight++;
          var probe=new Image(), triedAlt=false;
          probe.onload=function(){
            inflight--; got.push({id:f.id, src:probe.src});
            if(got.length>=WANT) finish(); else pump();
          };
          probe.onerror=function(){
            if(!triedAlt){ triedAlt=true;
              probe.src='https://drive.google.com/thumbnail?id='+encodeURIComponent(f.id)+'&sz=w1200';
              return;
            }
            inflight--; pump(); // both URLs failed — try the next file instead
          };
          probe.src=f.thumbnailLink.replace(/=s\d+$/,'=s1200');
        }

        function pump(){
          while(inflight<(WANT-got.length) && queue.length) load(queue.shift());
          if(!inflight && (got.length>=WANT || !queue.length)) finish();
        }
        pump();
      })
      .catch(function(){ /* Drive unreachable — keep the static gallery */ });
  })();
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
/* Lives on MERchives.html only. Pulls photos + documents live from a shared Google
   Drive folder via the Drive API (read-only key in CONFIG).

   Drive layout — pure drag-and-drop, nothing here ever needs editing:
     TOP-LEVEL "MERchives" FOLDER
       ├─ Documents ............... PDFs / Word docs → the "Documents" list
       ├─ Current Season .......... photo sub-folder → tile under RECENT PHOTOS
       ├─ Last Season ............. photo sub-folder → tile under RECENT PHOTOS
       ├─ 2020, 2015, … ........... year folders     → tiles under LEGACY PHOTOS
       └─ Legacy Photos ........... catch-all folder → tile under LEGACY PHOTOS

   Sub-folders are DISCOVERED AUTOMATICALLY on every page load:
     • a folder named as a 4-digit year ("2015") or containing the word
       "legacy" files under LEGACY PHOTOS (years newest-first, "Legacy
       Photos" last); every other folder files under RECENT PHOTOS
       ("Current Season" first, then "Last Season", then A-Z).
     • add, rename, or remove a folder in Drive and the page follows along —
       tile names come straight from the Drive folder names.

   If the API key or the top-level folder ID is blank, the page shows a calm
   "not connected yet" message instead of a broken grid. */
(function(){
  var galleryHost = document.getElementById('memberGallery');
  var docsHost    = document.getElementById('memberDocs');
  if(!galleryHost && !docsHost) return;   // only on MERchives.html

  var KEY  = CONFIG.MEMBERS_DRIVE_API_KEY;
  var ROOT = CONFIG.MEMBERS_DRIVE_ROOT_FOLDER_ID;   // top-level "MERchives" folder

  /* ---------- PHOTO GALLERIES (auto-discovered sub-folders) ---------- */
  var recentTiles = document.getElementById('recentTiles');
  var legacyTiles = document.getElementById('legacyTiles');

  if(galleryHost && recentTiles && legacyTiles){
    if(!KEY || !ROOT){
      tilesMessage(recentTiles, 'Not connected yet \u2014 add the shared folder\u2019s ID in the site settings.');
      tilesMessage(legacyTiles, 'Not connected yet');
    } else {
      listFolders(ROOT, function(err, folders){
        if(err){
          tilesMessage(recentTiles, 'Couldn\u2019t load \u2014 the shared Drive couldn\u2019t be reached just now. Try a refresh.');
          tilesMessage(legacyTiles, 'Couldn\u2019t load');
          return;
        }
        // split: 4-digit-year names + anything "legacy" go to LEGACY; the rest
        // to RECENT. The "Documents" folder is handled by the docs list below.
        var recent=[], legacy=[];
        folders.forEach(function(f){
          var name=(f.name||'').trim();
          if(f.id===CONFIG.MEMBERS_DRIVE_DOCS_FOLDER_ID || /^documents$/i.test(name)) return;
          if(/^\d{4}$/.test(name) || /legacy/i.test(name)) legacy.push(f);
          else recent.push(f);
        });
        // Recent: Current Season first, then Last Season, then A-Z
        var lead={'current season':0,'last season':1};
        recent.sort(function(a,b){
          var ra=lead[(a.name||'').trim().toLowerCase()], rb=lead[(b.name||'').trim().toLowerCase()];
          ra=(ra===undefined)?9:ra; rb=(rb===undefined)?9:rb;
          if(ra!==rb) return ra-rb;
          return (a.name||'').localeCompare(b.name||'', undefined, {numeric:true});
        });
        // Legacy: year folders newest-first, non-year folders ("Legacy Photos") last
        legacy.sort(function(a,b){
          var ya=/^\d{4}$/.test((a.name||'').trim()), yb=/^\d{4}$/.test((b.name||'').trim());
          if(ya && yb) return (b.name||'').trim()-(a.name||'').trim();
          if(ya!==yb) return ya?-1:1;
          return (a.name||'').localeCompare(b.name||'');
        });

        recentTiles.innerHTML=''; legacyTiles.innerHTML='';
        if(!recent.length) tilesMessage(recentTiles, 'No folders yet \u2014 add a photo folder to the shared Drive.');
        if(!legacy.length) tilesMessage(legacyTiles, 'No folders yet \u2014 add a year folder (e.g. \u201c2015\u201d) to the shared Drive.');

        var totalPhotos=0, pending=recent.length+legacy.length;
        recent.forEach(function(f){ buildFolder(f, recentTiles); });
        legacy.forEach(function(f){ buildFolder(f, legacyTiles); });

        // views exist now \u2014 let the page's hash router re-check the URL
        document.dispatchEvent(new Event('mlib:folders-ready'));

        function buildFolder(folder, tileHost){
          var slug=slugify(folder.name);

          // landing tile
          var tile=document.createElement('a');
          tile.className='mx-tile'; tile.href='#'+slug;
          var cover=document.createElement('span'); cover.className='mx-cover'; cover.setAttribute('aria-hidden','true');
          var body=document.createElement('span'); body.className='mx-body';
          var nm=document.createElement('span'); nm.className='mx-name'; nm.textContent=folder.name;
          var tMeta=document.createElement('span'); tMeta.className='mx-meta'; tMeta.textContent='Photo gallery';
          body.appendChild(nm); body.appendChild(tMeta);
          tile.appendChild(cover); tile.appendChild(body);
          tileHost.appendChild(tile);

          // gallery section (hidden until its hash is visited)
          var section=document.createElement('section');
          section.className='member-folder'; section.hidden=true;
          section.setAttribute('data-view', slug);
          section.innerHTML=
            '<div class="folder-head">'+
              '<h4 class="folder-name">'+esc(folder.name)+'</h4>'+
              '<span class="folder-meta" data-folder-count>Auto-synced</span>'+
            '</div>'+
            '<div class="member-gallery" data-folder-grid role="list">'+
              '<div class="member-gallery-loading">'+
                '<span class="gl-label">Loading photos\u2026</span>'+
                '<span class="gl-sub">Pulling the '+esc(folder.name)+' folder from the club\u2019s shared Drive.</span>'+
              '</div>'+
            '</div>';
          galleryHost.appendChild(section);
          var grid=section.querySelector('[data-folder-grid]');
          var metaEl=section.querySelector('[data-folder-count]');

          listImages(folder.id, function(err, files){
            pending--;
            if(err){ emptyGrid(grid, metaEl, 'Couldn\u2019t load', 'This folder couldn\u2019t be reached just now. Try a refresh.'); tMeta.textContent='Couldn\u2019t load'; finishCount(); return; }
            if(!files.length){ emptyGrid(grid, metaEl, 'No photos yet', 'Photos dropped into this Drive folder will appear here automatically.'); tMeta.textContent='No photos yet'; finishCount(); return; }
            renderPhotos(grid, files);
            totalPhotos += files.length;
            var label = files.length + (files.length===1?' photo':' photos');
            if(metaEl) metaEl.textContent = label;
            tMeta.textContent = label;
            var pick=files[Math.floor(Math.random()*files.length)];
            if(pick && pick.thumbnailLink){
              cover.style.backgroundImage="url('"+pick.thumbnailLink.replace(/=s\d+$/,'=s600')+"')";
            }
            finishCount();
          });
        }

        function finishCount(){
          if(pending<=0){
            var c=document.getElementById('memberGalleryCount');
            if(c && totalPhotos) c.textContent = totalPhotos + (totalPhotos===1?' photo':' photos');
          }
        }
      });
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
  // sub-folders of a folder (the archive sections), A-Z
  function listFolders(folderId, cb){
    var q = "'"+folderId+"' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent(q)
      + '&orderBy=' + encodeURIComponent('name')
      + '&pageSize=100'
      + '&fields=' + encodeURIComponent('files(id,name)')
      + '&key=' + encodeURIComponent(KEY);
    fetch(url).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){ cb(null, (j && j.files) || []); })
      .catch(function(){ cb(true, null); });
  }
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
var PER_PAGE = 16;   // 4 rows × 4 columns

  function renderPhotos(grid, files){
    var page = 0;
    var totalPages = Math.ceil(files.length / PER_PAGE);
    var folderSection = grid.closest('.member-folder');

    // pager controls (only built when there's more than one page)
    var pager = null, pageLabel = null, prevBtn = null, nextBtn = null;
    if(totalPages > 1){
      pager = document.createElement('div');
      pager.className = 'member-pager';
      prevBtn = document.createElement('button');
      prevBtn.type='button'; prevBtn.className='mpg-btn'; prevBtn.textContent='\u2190 Prev';
      pageLabel = document.createElement('span');
      pageLabel.className='mpg-label';
      nextBtn = document.createElement('button');
      nextBtn.type='button'; nextBtn.className='mpg-btn'; nextBtn.textContent='Next \u2192';
      pager.appendChild(prevBtn); pager.appendChild(pageLabel); pager.appendChild(nextBtn);
      folderSection.appendChild(pager);

      prevBtn.addEventListener('click', function(){ if(page>0){ page--; drawPage(); scrollToFolder(); } });
      nextBtn.addEventListener('click', function(){ if(page<totalPages-1){ page++; drawPage(); scrollToFolder(); } });
    }

    function scrollToFolder(){
      var head = folderSection.querySelector('.folder-head');
      var y = (head ? head.getBoundingClientRect().top : 0) + window.scrollY - 90;
      window.scrollTo({ top:y, behavior:'smooth' });
    }

    function drawPage(){
      var start = page * PER_PAGE;
      var slice = files.slice(start, start + PER_PAGE);
      grid.innerHTML='';
      slice.forEach(function(f){
        // drive.google.com/uc?export=view was deprecated by Google (returns 403 for
        // many files) — the file/d/{id}/view page is the reliable full-size link.
        var full = 'https://drive.google.com/file/d/' + f.id + '/view';
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
      if(pager){
        pageLabel.textContent = 'Page ' + (page+1) + ' of ' + totalPages;
        prevBtn.disabled = page===0;
        nextBtn.disabled = page===totalPages-1;
      }
    }

    drawPage();
  }

  function renderDocs(files){
    docsHost.innerHTML='';
    files.sort(function(a,b){
      return cleanName(a.name).localeCompare(cleanName(b.name), undefined, {numeric:true, sensitivity:'base'});
    });
    files.forEach(function(f){
      var type = (f.mimeType==='application/pdf') ? 'PDF' : 'DOC';
      var a=document.createElement('a');
      a.className='member-doc';
      a.setAttribute('data-type', type);
      a.setAttribute('role','listitem');
      a.href='https://drive.google.com/uc?export=download&id=' + f.id;
      a.target='_blank'; a.rel='noopener';
      a.setAttribute('aria-label','Download '+(f.name||'document'));

      var icon=document.createElement('span'); icon.className='md-icon'; icon.setAttribute('aria-hidden','true');
      var crest=document.createElement('img'); crest.className='md-crest'; crest.src='assets/grunion-crest.png'; crest.alt='';
      crest.onerror=function(){ icon.textContent=type; };  // fall back to "PDF"/"DOC" text if crest missing
      icon.appendChild(crest);
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

  function tilesMessage(host, text){
    host.innerHTML = '<div class="mx-loading">'+esc(text)+'</div>';
  }

  /* ---------- helpers ---------- */
  // "Current Season" → "current-season" (used as the tile's #hash)
  function slugify(n){
    return String(n||'').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'folder';
  }
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
