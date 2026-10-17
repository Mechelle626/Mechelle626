import pg from 'pg';import {writeFile} from 'node:fs/promises';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
const {rows}=await pool.query(`SELECT l.code,l.language_name,count(k.translation_key)::int AS total_keys,count(t.id) FILTER(WHERE length(trim(t.translation_value))>0)::int AS translated_keys,(count(k.translation_key)-count(t.id) FILTER(WHERE length(trim(t.translation_value))>0))::int AS missing_keys,round(100.0*count(t.id) FILTER(WHERE length(trim(t.translation_value))>0)/greatest(count(k.translation_key),1),2)::float AS percentage_complete,count(t.id) FILTER(WHERE t.review_status='Approved')::int AS approved_keys FROM braincraze.languages l CROSS JOIN braincraze.translation_keys k LEFT JOIN braincraze.translations t ON t.language_id=l.id AND t.translation_key=k.translation_key GROUP BY l.id ORDER BY l.code`);
const missing=(await pool.query(`SELECT l.code,k.translation_key FROM braincraze.languages l CROSS JOIN braincraze.translation_keys k LEFT JOIN braincraze.translations t ON t.language_id=l.id AND t.translation_key=k.translation_key WHERE coalesce(trim(t.translation_value),'')='' ORDER BY l.code,k.translation_key`)).rows;
const report={generatedAt:new Date().toISOString(),note:'Populated draft coverage does not establish linguistic quality or approval.',languages:rows,missingKeys:missing};
await writeFile('docs/translation-review.json',JSON.stringify(report,null,2)+'\n');console.table(rows);
if(process.argv.includes('--require-complete')&&rows.some(x=>x.missing_keys>0))process.exitCode=1;
}finally{await pool.end();}
