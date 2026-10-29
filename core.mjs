/** Original SamplePack implementation. No scientific analysis or private product code. */
export const LIMITS = Object.freeze({bytes:1_000_000, rows:10_000, columns:100, cell:100_000});
export class ManifestError extends Error { constructor(code,message){super(message);this.name='ManifestError';this.code=code;} }
export function parseCSV(text, limits=LIMITS){
  if(typeof text!=='string') throw new ManifestError('INPUT_TYPE','Expected CSV text.');
  if(new TextEncoder().encode(text).length>limits.bytes) throw new ManifestError('FILE_LIMIT',`File exceeds ${limits.bytes} bytes.`);
  if(text.includes('\0')) throw new ManifestError('NUL','NUL characters are not supported.');
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  if(!text.length) throw new ManifestError('EMPTY','The file is empty.');
  const rows=[]; let row=[], field='', state='start';
  const pushField=()=>{if(field.length>limits.cell)throw new ManifestError('CELL_LIMIT','A field is too long.'); row.push(field); field='';if(row.length>limits.columns)throw new ManifestError('COLUMN_LIMIT','Too many columns.');};
  const pushRow=()=>{pushField();rows.push(row);row=[];if(rows.length>limits.rows+1)throw new ManifestError('ROW_LIMIT','Too many data rows.');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(state==='quoted'){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else state='after';} else field+=c;
    }else if(c===','){pushField();state='start';}
    else if(c==='\r'||c==='\n'){pushRow();state='start';if(c==='\r'&&text[i+1]==='\n')i++;}
    else if(state==='after')throw new ManifestError('AFTER_QUOTE',`Unexpected character after closing quote at character ${i+1}.`);
    else if(c==='"'){if(state!=='start')throw new ManifestError('QUOTE','A quote must begin a field or be escaped inside a quoted field.');state='quoted';}
    else {field+=c;state='plain';}
    if(field.length>limits.cell)throw new ManifestError('CELL_LIMIT','A field is too long.');
  }
  if(state==='quoted')throw new ManifestError('UNCLOSED_QUOTE','A quoted field was not closed.');
  if(field!==''||row.length||state!=='start'||!/[\r\n]$/.test(text))pushRow();
  const headers=rows.shift();
  if(headers.some(h=>!h.trim()))throw new ManifestError('EMPTY_HEADER','Every column needs a non-empty header.');
  if(new Set(headers).size!==headers.length)throw new ManifestError('DUPLICATE_HEADER','Duplicate column headers are ambiguous. Rename them in a copy and try again.');
  for(let i=0;i<rows.length;i++)if(rows[i].length!==headers.length)throw new ManifestError('ROW_WIDTH',`Record ${i+2} has ${rows[i].length} fields; expected ${headers.length}. Records count the header, not physical lines.`);
  return {headers,rows};
}
export const FIELDS = Object.freeze(['sample_id','batch','date','notes']);
export function formulaLike(value){return /^[\s\u0000-\u001f]*[=+\-@]/u.test(value)||/^[\t\r\n]/.test(value);}
export function analyze(table, options){
  const {mapping,required=['sample_id'],trimIds=false}=options||{};
  if(!mapping||typeof mapping!=='object')throw new ManifestError('MAPPING','Review the column mapping first.');
  if(!Array.isArray(required)||required.some(f=>!FIELDS.includes(f)))throw new ManifestError('REQUIRED','Unknown required field.');
  const requiredFields=[...new Set(['sample_id',...required])];
  const used=[];
  for(const f of FIELDS){const i=mapping[f];if(i!==undefined&&i!==null&&i!==-1){if(!Number.isInteger(i)||i<0||i>=table.headers.length)throw new ManifestError('MAPPING',`Invalid column for ${f}.`);used.push(i);}}
  if(new Set(used).size!==used.length)throw new ManifestError('MAPPING_REUSE','A source column cannot map to more than one field.');
  for(const f of requiredFields)if(!Number.isInteger(mapping[f])||mapping[f]<0)throw new ManifestError('MAPPING_REQUIRED',`Select a column for required field ${f}.`);
  const issues=[], changes=[], seen=new Map();
  if(!table.rows.length)issues.push({severity:'error',record:null,field:null,code:'NO_DATA',message:'The manifest has no data records.'});
  const normalized=table.rows.map((source,index)=>{
    const record=index+2;const result={};
    for(const f of FIELDS)result[f]=(mapping[f]>=0&&Number.isInteger(mapping[f]))?source[mapping[f]]:'';
    if(trimIds&&result.sample_id!==result.sample_id.trim()){
      changes.push({record,field:'sample_id',kind:'trim_identifier',before:result.sample_id,after:result.sample_id.trim()});result.sample_id=result.sample_id.trim();
    }
    for(const f of requiredFields)if(!result[f].trim())issues.push({severity:'error',record,field:f,code:'REQUIRED_EMPTY',message:`Required ${f} is empty.`});
    const id=result.sample_id;
    if(id.trim()){
      if(seen.has(id)){issues.push({severity:'error',record,field:'sample_id',code:'DUPLICATE_ID',message:`Duplicate identifier; first appears at record ${seen.get(id)}.`});}else seen.set(id,record);
      if(id!==id.trim())issues.push({severity:'warning',record,field:'sample_id',code:'ID_WHITESPACE',message:'Identifier has surrounding whitespace; it is preserved unless trimming is explicitly selected.'});
    }
    if(result.date&&!/^\d{4}-\d{2}-\d{2}$/.test(result.date))issues.push({severity:'warning',record,field:'date',code:'DATE_FORMAT',message:'Date is not YYYY-MM-DD; value is preserved. Dates are not interpreted.'});
    for(const f of FIELDS)if(formulaLike(result[f]))issues.push({severity:'warning',record,field:f,code:'FORMULA_LIKE',message:'Spreadsheet CSV export will prefix this field with an apostrophe; raw input and JSON values are preserved.'});
    return result;
  });
  const unmappedColumns=table.headers.filter((_,i)=>!used.includes(i));
  if(unmappedColumns.length)issues.push({severity:'warning',record:null,field:null,code:'UNMAPPED_COLUMNS',message:`${unmappedColumns.length} columns are excluded from the normalized view. Original input is retained.`});
  return {schemaVersion:'samplepack-0.1',mapping:Object.fromEntries(FIELDS.map(f=>[f,Number.isInteger(mapping[f])&&mapping[f]>=0?{index:mapping[f],header:table.headers[mapping[f]]}:null])),required:requiredFields,trimIds,recordCount:normalized.length,normalized,issues,changes,unmappedColumns,errorCount:issues.filter(i=>i.severity==='error').length,warningCount:issues.filter(i=>i.severity==='warning').length};
}
export function escapeCell(value){return '"'+String(value).replaceAll('"','""')+'"';}
export function spreadsheetCSV(result){
  if(result.errorCount)throw new ManifestError('EXPORT_BLOCKED','Resolve validation errors before exporting normalized CSV. The issue report and original input remain available.');
  const changes=[];
  const rows=result.normalized.map((row,index)=>FIELDS.map(f=>{const raw=row[f];const safe=formulaLike(raw)?"'"+raw:raw;if(safe!==raw)changes.push({record:index+2,field:f,kind:'spreadsheet_escape',before:raw,after:safe});return safe;}));
  return {text:[FIELDS,...rows].map(r=>r.map(escapeCell).join(',')).join('\r\n')+'\r\n',changes};
}
export function makeReport(result, source){
  const safe=result.errorCount?null:spreadsheetCSV(result);
  return {...result,source,exportAvailable:!result.errorCount,exportChanges:safe?.changes??[],notes:['Generic metadata validation only; no scientific measurements are corrected.','Normalized CSV contains only the four target fields. JSON preserves unescaped mapped values; source file is downloaded separately.','Identifiers are case-sensitive. Dates receive a format warning only, not calendar validation.','Spreadsheet apostrophe prefixes are a mitigation, not a universal guarantee across spreadsheet applications.']};
}
