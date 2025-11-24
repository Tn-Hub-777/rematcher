// src/app.js — Full Database-Connected Client Logic
// Requires PapaParse library loaded in index.html

const $ = id => document.getElementById(id);

// ---- State ----
let baseBuyers = [], baseListings = [];
let uploadedBuyers = [], uploadedListings = [];
let mergedBuyers = [], mergedListings = [];
let matches = [];

let csvRaw = [], csvColumns = [], selectedSet = new Set();
let dataFilters = [], matchFilters = [];

// ---- Small utilities ----
function parseCSV(text){ return Papa.parse(text, { header:true, skipEmptyLines:true }).data; }
function toCSV(arr){ return Papa.unparse(arr); }
function downloadText(filename, text){
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function uid(prefix='id'){ return prefix + '-' + Math.random().toString(36).slice(2,10); }

function unitToMultiplier(unit){
  unit = (unit||'').toLowerCase();
  if(unit.includes('lakh')) return 100000;
  if(unit.includes('thousand')) return 1000;
  if(unit.includes('crore')) return 10000000;
  return 1;
}
function parseNumber(v){ if(v==null||v==='') return null; const n = parseFloat(String(v).replace(/[^0-9.]/g,'')); return isNaN(n)?null:n; }
function toRupees(value, unit){ const n = parseNumber(value); if(n===null) return null; return n * unitToMultiplier(unit); }

// ---- ID helpers ----
function nextIdFor(prefix, existingArrays) {
  const candidates = [];
  for (const arr of existingArrays || []) {
    if (!arr) continue;
    for (const r of arr) {
      if (!r) continue;
      const id = (r.id || '').toString();
      const m = id.match(new RegExp('^' + prefix + '-(\\d+)$'));
      if (m) candidates.push(parseInt(m[1], 10));
    }
  }
  const maxNum = candidates.length ? Math.max(...candidates) : 0;
  const next = (maxNum + 1);
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function ensureUniqueId(prefix, suppliedId, existingArrays) {
  if (!suppliedId) return nextIdFor(prefix, existingArrays);
  const idLower = suppliedId.toString();
  const exists = (existingArrays || []).some(arr => arr && arr.some(r => (r.id||'').toString() === idLower));
  if (!exists) return idLower;
  return nextIdFor(prefix, existingArrays);
}

// ---- Merge helpers (Merges DB data + Local uploads) ----
function mergeBuyers(base, uploaded){
  const out = [...(base || [])];
  const ids = new Set((base||[]).map(b => (b.id||'').toString()));
  for(const u of (uploaded||[])){
    if(!u) continue;
    const uid = (u.id||'').toString();
    if(uid && !ids.has(uid)){ out.push(u); ids.add(uid); }
    else if(!uid){
      // Simple duplicate check if ID missing
      const key = ((u.name||'')+'|'+(u.city||'')+'|'+(u.mobile||'')).toLowerCase();
      const exists = out.some(b=>(((b.name||'')+'|'+(b.city||'')+'|'+(b.mobile||'')).toLowerCase()===key));
      if(!exists) out.push(u);
    }
  }
  return out;
}
function mergeListings(base, uploaded){
  const out = [...(base || [])];
  const urls = new Set((base||[]).map(l => (l.url||'').toString()));
  for(const u of (uploaded||[])){
    if(!u) continue;
    const uurl = (u.url||'').toString();
    if(uurl && !urls.has(uurl)){ out.push(u); urls.add(uurl); }
    else if(!uurl){
      const key = ((u.address||'')+'|'+(u.locality||'')+'|'+(u.price||'')).toLowerCase();
      const exists = out.some(l=>(((l.address||'')+'|'+(l.locality||'')+'|'+(l.price||'')).toLowerCase()===key));
      if(!exists) out.push(u);
    }
  }
  return out;
}

// ---- loadDefaults: Fetches from DB ----
async function loadDefaults(){
  baseBuyers = []; baseListings = [];

  // 1. Fetch Buyers from DB
  try {
    const r1 = await fetch('/api/buyers');
    if (r1.ok) {
      baseBuyers = await r1.json();
    } else console.warn('API /api/buyers failed');
  } catch(e){ console.warn('Fetch buyers error', e); }

  // 2. Fetch Listings from DB
  try {
    const r2 = await fetch('/api/listings');
    if (r2.ok) {
      const raw = await r2.json();
      baseListings = raw.map(l => ({ 
        ...l, 
        price: parseNumber(l.price) || parseNumber(l.price_raw) || l.price 
      }));
    } else console.warn('API /api/listings failed');
  } catch(e){ console.warn('Fetch listings error', e); }

  // Re-merge with any local uploads user has done in this session
  mergedBuyers = mergeBuyers(baseBuyers, uploadedBuyers);
  mergedListings = mergeListings(baseListings, uploadedListings);

  console.info('loadDefaults finished. Total Buyers:', mergedBuyers.length, 'Total Listings:', mergedListings.length);
}

// ---- loadCsvFile: Populates table from DB or Memory ----
async function loadCsvFile(name){
  csvRaw = []; csvColumns = [];

  // Map dropdown names to API endpoints
  const apiEndpoint = {
    'buyers.csv': '/api/buyers',
    'listings.csv': '/api/listings'
  }[name];

  // A. Handle Matches (Client-side only)
  if (name === 'matches.csv') {
    const source = matches || [];
    if (source && source.length) {
      csvRaw = source.map((r,i) => ({ __index:i, ...r }));
      csvColumns = csvRaw.length ? Object.keys(csvRaw[0]).filter(k => k !== '__index') : [];
      renderCsvTable();
      console.log(`Loaded matches from memory: ${csvRaw.length} rows`);
    } else {
      alert("No matches generated yet. Run the Matcher first.");
      renderCsvTable();
    }
    return;
  }

  // B. Handle DB Data (Buyers/Listings)
  if (apiEndpoint) {
    try {
      console.log(`Fetching from ${apiEndpoint}...`);
      const res = await fetch(apiEndpoint);
      if(!res.ok) throw new Error(`Server returned ${res.status}`);
      
      const data = await res.json();

      if(name === 'buyers.csv') {
        baseBuyers = data;
        mergedBuyers = mergeBuyers(baseBuyers, uploadedBuyers);
        csvRaw = mergedBuyers.map((r,i) => ({ __index:i, ...r }));
      } 
      else if(name === 'listings.csv') {
        baseListings = data.map(l => ({ ...l, price: parseNumber(l.price)||l.price }));
        mergedListings = mergeListings(baseListings, uploadedListings);
        csvRaw = mergedListings.map((r,i) => ({ __index:i, ...r }));
      }

      csvColumns = csvRaw.length ? Object.keys(csvRaw[0]).filter(k => k !== '__index') : [];
      renderCsvTable();
      console.log(`Loaded ${csvRaw.length} rows from Database`);
      return;

    } catch(err) {
      console.error(err);
      alert(`Error loading from DB: ${err.message}\nEnsure 'node server.js' is running.`);
    }
  }
}

// ---- CSV rendering / editing ----
function renderCsvTable(){
  const head = $('csvHead'), body = $('csvBody');
  if(!head || !body) return;
  head.innerHTML=''; body.innerHTML='';
  if(!csvColumns.length){ head.innerHTML = '<tr><th>No data</th></tr>'; return; }
  
  const trh = document.createElement('tr');
  trh.innerHTML = `<th><input id="selectAll" type="checkbox" /></th>` + csvColumns.map(c=>`<th>${c}</th>`).join('') + '<th>Actions</th>';
  head.appendChild(trh);
  
  const selectAllEl = $('selectAll');
  if(selectAllEl) selectAllEl.addEventListener('change', e=> { if(e.target.checked) csvRaw.forEach(r=>selectedSet.add(r.__index)); else selectedSet.clear(); renderCsvTable(); });

  const filterQuick = ($('csvFilterQuick') ? $('csvFilterQuick').value : '').toLowerCase();
  csvRaw.forEach(row => {
    const rowValues = csvColumns.map(c=> (row[c]||'').toString()).join(' ').toLowerCase();
    if(filterQuick && !rowValues.includes(filterQuick)) return;
    const tr = document.createElement('tr');
    const checked = selectedSet.has(row.__index)?'checked':'';
    tr.innerHTML = `<td><input type="checkbox" data-idx="${row.__index}" ${checked}></td>` +
      csvColumns.map(c=>`<td>${(row[c]||'')}</td>`).join('') +
      `<td><button data-idx="${row.__index}" class="edit">Edit</button></td>`;
    body.appendChild(tr);
  });

// ... inside renderCsvTable() ...

// 1. Find the 'Edit' buttons
body.querySelectorAll('button.edit').forEach(btn => btn.onclick = async () => {
    const idx = parseInt(btn.getAttribute('data-idx'));
    
    // Find the row in memory
    const row = csvRaw.find(r => r.__index === idx);
    if (!row) return;

    // Check if we are in "Database Mode" (buyers/listings) or "Offline Mode" (matches)
    const currentCsv = $('csvSelect').value;
    const isDbData = (currentCsv === 'buyers.csv' || currentCsv === 'listings.csv');

    // Create a copy of the row to edit so we don't break the original yet
    const editedRow = { ...row };
    
    // Ask user for changes (simple prompt loop)
    let hasChanges = false;
    for (const col of csvColumns) {
        // Skip internal fields like __index
        if (col === '__index') continue; 
        
        const oldVal = row[col] || '';
        const newVal = prompt(`Edit ${col}`, oldVal);
        
        if (newVal !== null && newVal !== oldVal) {
            editedRow[col] = newVal;
            hasChanges = true;
        }
    }

    if (!hasChanges) return; // User cancelled or changed nothing

    // IF ONLINE DATABASE: Send PUT request to Server
    if (isDbData && row.id) {
        try {
            const apiEndpoint = currentCsv === 'buyers.csv' ? '/api/buyers' : '/api/listings';
            
            // Clean up: Remove __index before sending to DB
            delete editedRow.__index;

            const res = await fetch(`${apiEndpoint}/${row.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editedRow)
            });

            if (res.ok) {
                alert('Saved successfully!');
                await loadCsvFile(currentCsv); // Reload fresh data from DB
            } else {
                alert('Server failed to save edit.');
            }
        } catch (e) {
            console.error(e);
            alert('Error connecting to server.');
        }
    } 
    // IF OFFLINE (Matches or uploaded files): Just update memory
    else {
        Object.assign(row, editedRow); // Update local object
        pushCsvEditsToState();
        renderCsvTable();
    }
});
  
  // NOTE: Editing here is Client-Side Only (Memory) unless we add an UPDATE endpoint
  body.querySelectorAll('button.edit').forEach(btn=> btn.onclick = ()=> {
    const idx = parseInt(btn.getAttribute('data-idx'));
    const row = csvRaw.find(r=>r.__index===idx);
    if(!row) return;
    for(const col of csvColumns){
      const val = prompt(`Edit ${col}`, row[col]||'');
      if(val !== null) row[col] = val;
    }
    pushCsvEditsToState();
    renderCsvTable();
  });
}

async function deleteSelectedRows(){
  if(!selectedSet.size){ alert('No selection'); return; }
  if(!confirm(`Are you sure you want to permanently delete ${selectedSet.size} rows?`)) return;

  const currentCsv = $('csvSelect').value;
  const isBuyer = currentCsv === 'buyers.csv';
  const apiBase = isBuyer ? '/api/buyers' : '/api/listings';

  // Loop through selected items and delete one by one
  for(const idx of selectedSet){
    const row = csvRaw.find(r => r.__index === idx);
    if(row && row.id){
      try {
        const res = await fetch(`${apiBase}/${row.id}`, { method: 'DELETE' });
        if(!res.ok) console.error(`Failed to delete ${row.id}`);
      } catch(e){
        console.error('Network error deleting', row.id);
      }
    }
  }

  alert('Deletion complete. Refreshing table...');
  selectedSet.clear();
  
  // Reload fresh data from the database
  await loadCsvFile(currentCsv);
}

function downloadCurrentCsv(){
  if(!csvRaw.length) { alert('No data loaded to download'); return; }
  const out = csvRaw.map(r=> {
    const obj = {}; csvColumns.forEach(c => obj[c] = r[c] || ''); return obj;
  });
  downloadText($('csvSelect').value || 'data.csv', toCSV(out));
}

function pushCsvEditsToState(){
  const name = $('csvSelect').value;
  const rows = csvRaw.map(r => { const obj={}; csvColumns.forEach(c=> obj[c]=r[c]||''); return obj; });
  if(name === 'buyers.csv'){
    // Updating memory only
    if(uploadedBuyers.length) uploadedBuyers = rows; else mergedBuyers = rows;
  } else if(name === 'listings.csv'){
    if(uploadedListings.length) uploadedListings = rows; else mergedListings = rows;
  } else if(name === 'matches.csv'){
    matches = rows;
  }
}

// ---- Matcher logic ----
function runMatcher(buyersArr, listingsArr, minScore=60){
  const out = [];
  const listingsNormalized = (listingsArr||[]).map(l => ({ ...l, _text: ((l.description||'') + ' ' + (l.address||'') + ' ' + (l.project||'') + ' ' + (l.locality||'')).toLowerCase() }));
  
  for(const b of (buyersArr||[])){
    const bId = b.id||uid('buyer');
    const minP = b.budget_rupees || parseNumber(b.budget_raw) || 0;
    const loc = (b.city || b.locality || b.state || b.preferred_localities || '').toString().toLowerCase();
    const keywords = (b.preferred_localities || b.preferred_projects || b.property_type || b.specific || '').toString().toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    
    for(const l of listingsNormalized){
      let score = 0;
      const lp = parseNumber(l.price) || parseNumber(l.price_raw) || 0;
      if(lp && minP){
        if(Math.abs(lp - minP) / Math.max(1, minP) < 0.2) score += 50;
        else {
          const diff = Math.abs(lp - minP);
          const denom = Math.max(1, Math.max(lp, minP));
          score += Math.max(0, 50 - (diff/denom)*50);
        }
      } else if(lp && !minP) score += 10;
      
      if(loc && ((l.locality||'') + ' ' + (l.address||'') + ' ' + (l.state||'')).toLowerCase().includes(loc)) score += 25;
      for(const kw of keywords) if(kw && l._text.includes(kw)) score += 20;
      
      if(score > 0){
        const sc = Math.min(100, Math.round(score));
        if(sc >= minScore) out.push({
          buyer_id: bId, buyer_name: b.name||'', listing_id: l.id||'', listing_title: l.project||l.address||l.description||'', listing_price: lp, listing_location: l.locality||l.state||'', listing_url: l.url||'', score: sc
        });
      }
    }
  }
  out.sort((a,b)=> a.buyer_id < b.buyer_id ? -1 : (a.buyer_id > b.buyer_id ? 1 : b.score - a.score));
  return out;
}

// ---- Filters helper ----
const OPERATORS = [
  { v: 'contains', label: 'contains' }, { v: 'equals', label: 'equals' },
  { v: 'starts', label: 'starts with' }, { v: 'ends', label: 'ends with' },
  { v: 'gt', label: '>' }, { v: 'lt', label: '<' },
  { v: 'gte', label: '>=' }, { v: 'lte', label: '<=' }
];

function createFilterRow(container, columns, filtersArray) {
  const row = document.createElement('div'); row.className='filter-row';
  const colSel = document.createElement('select');
  columns.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; colSel.appendChild(opt); });
  const opSel = document.createElement('select');
  OPERATORS.forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.label; opSel.appendChild(opt); });
  const valInp = document.createElement('input'); valInp.placeholder = 'value';
  const ci = document.createElement('label'); ci.style.fontSize='12px'; ci.style.color='#6b7280';
  const ciCheckbox = document.createElement('input'); ciCheckbox.type = 'checkbox'; ciCheckbox.checked = true; ci.appendChild(ciCheckbox); ci.appendChild(document.createTextNode(' ci'));
  const rem = document.createElement('button'); rem.textContent = 'Remove'; rem.style.background = '#ef4444'; rem.style.color='white'; rem.style.border='none'; rem.style.padding='6px 8px'; rem.style.borderRadius='6px';
  row.appendChild(colSel); row.appendChild(opSel); row.appendChild(valInp); row.appendChild(ci); row.appendChild(rem); container.appendChild(row);
  
  const rule = { column: colSel.value, op: opSel.value, value: '', caseInsensitive: ciCheckbox.checked };
  filtersArray.push(rule);
  colSel.onchange = () => { rule.column = colSel.value; };
  opSel.onchange = () => { rule.op = opSel.value; };
  valInp.oninput = () => { rule.value = valInp.value; };
  ciCheckbox.onchange = () => { rule.caseInsensitive = ciCheckbox.checked; };
  rem.onclick = () => { const i = filtersArray.indexOf(rule); if (i >= 0) filtersArray.splice(i, 1); container.removeChild(row); };
}

function predicateForRule(rule) {
  const col = rule.column; const op = rule.op; const valRaw = rule.value; const ci = rule.caseInsensitive;
  return function(item) {
    let left = (item[col] === undefined || item[col] === null) ? '' : String(item[col]);
    let right = String(valRaw);
    if (ci) { left = left.toLowerCase(); right = right.toLowerCase(); }
    const leftNum = parseFloat(left.replace(/[^0-9.\-]/g,'')); const rightNum = parseFloat(right.replace(/[^0-9.\-]/g,''));
    const numericPossible = !isNaN(leftNum) && !isNaN(rightNum);
    switch(op) {
      case 'contains': return left.includes(right);
      case 'equals': return left === right;
      case 'starts': return left.startsWith(right);
      case 'ends': return left.endsWith(right);
      case 'gt': return numericPossible ? (leftNum > rightNum) : (left > right);
      case 'lt': return numericPossible ? (leftNum < rightNum) : (left < right);
      case 'gte': return numericPossible ? (leftNum >= rightNum) : (left >= right);
      case 'lte': return numericPossible ? (leftNum <= rightNum) : (left <= right);
      default: return false;
    }
  };
}
function applyFilters(arr, filtersArray, mode = 'and') {
  if (!filtersArray || !filtersArray.length) return arr;
  const preds = filtersArray.map(predicateForRule);
  if (mode === 'and') return arr.filter(item => preds.every(p => p(item)));
  return arr.filter(item => preds.some(p => p(item)));
}

// ---- DOM wiring ----
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Initial Load from DB
  await loadDefaults();

  // Navigation
  function showPage(name){
    ['buyers','listings','data','matches'].forEach(p=> {
      const el = document.getElementById('page-' + p);
      if(el) el.style.display = (p === name) ? 'block':'none';
      document.querySelectorAll('nav button').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-route') === name));
    });
  }
  document.querySelectorAll('nav button').forEach(btn => btn.onclick = ()=> showPage(btn.getAttribute('data-route')));
  showPage('buyers'); // Default tab

  // Buyer Form - SAVE TO DB
  const addBuyerBtn = $('addBuyer');
  if(addBuyerBtn) addBuyerBtn.onclick = async () => {
    const existingForIds = [baseBuyers, mergedBuyers, uploadedBuyers];
    const suppliedId = ''; 
    const id = ensureUniqueId('buyer', suppliedId, existingForIds);
    const rec = {
      id,
      name: $('buyer_name').value.trim(),
      mobile: $('buyer_mobile').value.trim(),
      mobile2: $('buyer_mobile2').value.trim(),
      email: $('buyer_email').value.trim(),
      country: $('buyer_country').value.trim(),
      state: $('buyer_state').value.trim(),
      city: $('buyer_city').value.trim(),
      service_type: $('buyer_service_type').value.trim(),
      property_type: $('buyer_property_type').value.trim(),
      sale_type: $('buyer_sale_type').value.trim(),
      furnishing: $('buyer_furnishing').value.trim(),
      possession_status: $('buyer_possession_status').value.trim(),
      possession_time: $('buyer_possession_time').value.trim(),
      budget_raw: $('buyer_budget').value.trim(),
      budget_unit: ($('buyer_budget_unit')?$('buyer_budget_unit').value:'lakh'),
      budget_rupees: toRupees($('buyer_budget').value.trim(), ($('buyer_budget_unit')?$('buyer_budget_unit').value:'lakh')),
      area: $('buyer_area').value.trim(),
      area_unit: ($('buyer_area_unit')?$('buyer_area_unit').value:'Sq Mt'),
      preferred_localities: $('buyer_localities').value.trim(),
      preferred_projects: $('buyer_projects').value.trim(),
      lead_source: $('buyer_lead_source').value.trim(),
      referral: $('buyer_referral').value.trim(),
      nri: ($('buyer_nri')?$('buyer_nri').value:'no'),
      loan_required: ($('buyer_loan_required')?$('buyer_loan_required').value:'no'),
      purpose: ($('buyer_purpose')?$('buyer_purpose').value:''),
      specific: $('buyer_specific').value.trim()
    };
    if(!rec.name || !rec.mobile){ alert('Buyer name and mobile are required'); return; }

    try {
        const res = await fetch('/api/buyers', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(rec)
        });
        if(res.ok){
            alert(`Buyer saved to Database (ID: ${id})`);
            await loadDefaults(); // Refresh data
            // Clear inputs
            ['buyer_name','buyer_mobile','buyer_mobile2','buyer_email','buyer_state','buyer_city','buyer_property_type','buyer_budget','buyer_area','buyer_localities','buyer_projects','buyer_lead_source','buyer_referral','buyer_specific'].forEach(id => { if($(id)) $(id).value = ''; });
        } else {
            alert('Failed to save to database.');
        }
    } catch(err) { console.error(err); alert('Server Error'); }
  };

  // Listing Form - SAVE TO DB
  const addListingBtn = $('addListing');
  if(addListingBtn) addListingBtn.onclick = async () => {
    const existingForIds = [baseListings, mergedListings, uploadedListings];
    const suppliedId = '';
    const id = ensureUniqueId('listing', suppliedId, existingForIds);
    const rec = {
      id,
      deal_type: ($('listing_deal_type')?$('listing_deal_type').value:'Sell'),
      furnishing: ($('listing_furnishing')?$('listing_furnishing').value:''),
      property_type: $('listing_property_type').value.trim(),
      bedrooms: $('listing_bedrooms').value.trim(),
      state: $('listing_state').value.trim(),
      locality: $('listing_locality').value.trim(),
      google_address: $('listing_google_address').value.trim(),
      project: $('listing_project').value.trim(),
      address: $('listing_address').value.trim(),
      area: $('listing_area').value.trim(),
      area_unit: ($('listing_area_unit')?$('listing_area_unit').value:'Sq Mt'),
      price_raw: $('listing_price').value.trim(),
      price_unit: ($('listing_price_unit')?$('listing_price_unit').value:'Lakh'),
      price: toRupees($('listing_price').value.trim(), ($('listing_price_unit')?$('listing_price_unit').value:'Lakh')),
      deposit_raw: $('listing_deposit').value.trim(),
      deposit_unit: ($('listing_deposit_unit')?$('listing_deposit_unit').value:'Lakh'),
      deposit: toRupees($('listing_deposit').value.trim(), ($('listing_deposit_unit')?$('listing_deposit_unit').value:'Lakh')),
      contact: $('listing_contact').value.trim(),
      url: $('listing_url').value.trim(),
      description: $('listing_description').value.trim()
    };
    if(!rec.address || !rec.description){ alert('Listing address and description required'); return; }

    try {
        const res = await fetch('/api/listings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(rec)
        });
        if(res.ok){
            alert(`Listing saved to Database (ID: ${id})`);
            await loadDefaults();
            // Clear inputs
            ['listing_address','listing_description','listing_price','listing_area','listing_contact','listing_url','listing_bedrooms','listing_project','listing_google_address'].forEach(id => { if($(id)) $(id).value = ''; });
        } else {
            alert('Failed to save to database.');
        }
    } catch(err) { console.error(err); alert('Server Error'); }
  };

  // Data buttons
  const refreshCsv = $('refreshCsv');
  if(refreshCsv) refreshCsv.onclick = async ()=> loadCsvFile($('csvSelect').value);
  const deleteBtn = $('deleteSelected'); if(deleteBtn) deleteBtn.onclick = ()=> deleteSelectedRows();
  const downloadCsvBtn = $('downloadCsv'); if(downloadCsvBtn) downloadCsvBtn.onclick = ()=> downloadCurrentCsv();

  // Uploads for Matches page (Client-Side Parsing for ad-hoc matching)
  const uploadBuyers = $('uploadBuyers');
  if(uploadBuyers) uploadBuyers.onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    uploadedBuyers = parseCSV(await f.text());
    uploadedBuyers = uploadedBuyers.map(b => ({ ...b, budget_rupees: toRupees(b.budget_raw||b.budget, b.budget_unit||'lakh') }));
    alert(`Parsed ${uploadedBuyers.length} buyers from file (In-memory only). Click 'Merge' to include them in matching.`);
  };
  const uploadListings = $('uploadListings');
  if(uploadListings) uploadListings.onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    uploadedListings = parseCSV(await f.text());
    uploadedListings = uploadedListings.map(l => ({ ...l, price: toRupees(l.price_raw||l.price, l.price_unit||'lakh'), area: parseNumber(l.area), area_unit: l.area_unit || 'Sq Mt' }));
    alert(`Parsed ${uploadedListings.length} listings from file (In-memory only). Click 'Merge' to include them in matching.`);
  };

  // Merge & run
  const mergeAndRunBtn = $('mergeAndRun');
  if(mergeAndRunBtn) mergeAndRunBtn.onclick = async () => {
    // Refresh DB data before running logic
    await loadDefaults();
    
    // Merge DB + Local Uploads
    mergedBuyers = mergeBuyers(baseBuyers, uploadedBuyers);
    mergedListings = mergeListings(baseListings, uploadedListings);
    
    const minScore = parseFloat($('minScore').value) || 60;
    matches = runMatcher(mergedBuyers, mergedListings, minScore);
    renderMatches(matches);
    alert(`Matcher ran on ${mergedBuyers.length} buyers & ${mergedListings.length} listings. Results: ${matches.length}`);
  };

  // download matches
  const downloadMatchesBtn = $('downloadMatchesBtn'); if(downloadMatchesBtn) downloadMatchesBtn.onclick = ()=> downloadText('matches.csv', toCSV(matches || []));

  // Filters setup (Data and Matches)
  const addDataBtn = $('addDataFilterBtn');
  const dataFiltersContainer = $('dataFiltersContainer');
  const applyDataFiltersBtn = $('applyDataFilters');
  const clearDataFiltersBtn = $('clearDataFilters');
  const dataFilterModeSel = $('dataFilterMode');

  if(addDataBtn) addDataBtn.addEventListener('click', () => {
    const csvName = $('csvSelect').value;
    let columns = [];
    if (csvName === 'buyers.csv') columns = (mergedBuyers[0]) ? Object.keys(mergedBuyers[0]) : [];
    else if (csvName === 'listings.csv') columns = (mergedListings[0]) ? Object.keys(mergedListings[0]) : [];
    else if (csvName === 'matches.csv') columns = (matches[0]) ? Object.keys(matches[0]) : [];
    else columns = csvColumns || [];
    if (!columns || !columns.length) { alert('No columns available to filter. Load data first.'); return; }
    createFilterRow(dataFiltersContainer, columns, dataFilters);
  });

  if(applyDataFiltersBtn) applyDataFiltersBtn.addEventListener('click', () => {
    const mode = dataFilterModeSel ? dataFilterModeSel.value : 'and';
    if (!csvRaw || !csvRaw.length) { alert('No table loaded. Click Load CSV first.'); return; }
    const baseArray = csvRaw.map(r => { const obj = {}; csvColumns.forEach(c => obj[c] = r[c] || ''); return obj; });
    const filtered = applyFilters(baseArray, dataFilters, mode);
    csvRaw = filtered.map((r, i) => ({ __index: i, ...r }));
    renderCsvTable();
  });

  if(clearDataFiltersBtn) clearDataFiltersBtn.addEventListener('click', () => {
    dataFilters = []; if(dataFiltersContainer) dataFiltersContainer.innerHTML = '';
    loadCsvFile($('csvSelect').value);
  });

  const addMatchBtn = $('addMatchFilterBtn');
  const matchFiltersContainer = $('matchFiltersContainer');
  const applyMatchFiltersBtn = $('applyMatchFilters');
  const clearMatchFiltersBtn = $('clearMatchFilters');
  const matchFilterModeSel = $('matchFilterMode');

  if(addMatchBtn) addMatchBtn.addEventListener('click', () => {
    const example = matches && matches.length ? matches[0] : (mergedListings && mergedListings.length ? mergedListings[0] : {});
    const columns = example ? Object.keys(example) : [];
    if (!columns.length) { alert('Run the matcher first to get columns to filter.'); return; }
    createFilterRow(matchFiltersContainer, columns, matchFilters);
  });

  if(applyMatchFiltersBtn) applyMatchFiltersBtn.addEventListener('click', () => {
    const mode = matchFilterModeSel ? matchFilterModeSel.value : 'and';
    const smin = parseFloat($('matchScoreMin').value || '0');
    const smax = parseFloat($('matchScoreMax').value || '100');
    let filtered = matches.slice();
    if (matchFilters.length) filtered = applyFilters(filtered, matchFilters, mode);
    filtered = filtered.filter(m => {
      const sc = parseFloat(m.score || 0); return sc >= smin && sc <= smax;
    });
    renderMatches(filtered);
  });

  if(clearMatchFiltersBtn) clearMatchFiltersBtn.addEventListener('click', () => {
    matchFilters = []; if(matchFiltersContainer) matchFiltersContainer.innerHTML = '';
    renderMatches(matches || []);
  });

  // Default initialization
  if($('csvSelect')) $('csvSelect').value = 'buyers.csv';
  if($('refreshCsv')) $('refreshCsv').click();
});

// ---- renderMatches ----
function renderMatches(ms){
  const cont = $('matchesContainer'); if(!cont) return;
  cont.innerHTML='';
  if(!ms || !ms.length){ cont.innerHTML = '<div class="muted">No matches yet</div>'; return; }
  const grouped = {};
  ms.forEach(m => { grouped[m.buyer_id] = grouped[m.buyer_id] || { buyer_name: m.buyer_name, rows: [] }; grouped[m.buyer_id].rows.push(m); });
  for(const bid of Object.keys(grouped)){
    const g = grouped[bid];
    const card = document.createElement('div'); card.className='card'; card.style.marginBottom='12px';
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${g.buyer_name||'(unnamed)'}</strong><div class="muted">Buyer ID: ${bid}</div></div><div class="muted">${g.rows.length} matches</div></div>`;
    const grid = document.createElement('div'); grid.className='listings-grid';
    g.rows.forEach(r => {
      const li = document.createElement('div'); li.className='listing';
      li.innerHTML = `<div><a href="${r.listing_url||'#'}" target="_blank">${r.listing_title||'Listing'}</a> — <strong>₹${r.listing_price||''}</strong></div><div class="muted">${r.listing_location||''}</div><div style="margin-top:6px">Score: <strong>${r.score}</strong></div>`;
      grid.appendChild(li);
    });
    card.appendChild(grid); cont.appendChild(card);
  }
}