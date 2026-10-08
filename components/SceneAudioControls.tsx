'use client';

import type { SceneAcoustics } from '@/lib/scene-audio';

export default function SceneAudioControls({ value, voiceMode, disabled, onChange }: {
  value?: SceneAcoustics; voiceMode: 'recording'|'clone'|'silent'; disabled: boolean;
  onChange: (value: SceneAcoustics | undefined) => void;
}) {
  if (voiceMode === 'silent') return null;
  const field = 'creator-control';
  function chooseSpace(space: '' | SceneAcoustics['space']) {
    if (!space) { onChange(undefined); return; }
    const referenceContent = voiceMode === 'clone' ? 'speech_only' : value?.referenceContent ?? 'mixed';
    onChange({space,microphone:space==='open_air'?'phone_camera':'close_mic',distanceMeters:space==='open_air'?2:0.3,
      referenceContent,ambienceMode:referenceContent==='mixed'?'preserve_reference':'generate_from_scene',
      referenceAcoustics:value?.referenceAcoustics??'unknown',soundscape:value?.soundscape??''});
  }
  function update(change: Partial<SceneAcoustics>) { if(value) onChange({...value,...change}); }
  return <div>
    <label className="creator-field"><span>Garso erdvė</span><select className={field} value={value?.space??''} disabled={disabled} onChange={e=>chooseSpace(e.target.value as ''|SceneAcoustics['space'])}>
      <option value="">Pagal bendrą scenos aprašymą</option><option value="open_air">Atvirame lauke · pajūris, parkas, gatvė</option><option value="interior">Patalpoje · pagal matomą erdvę</option>
    </select><small>Pajūryje svarbu mikrofono atstumas ir balso bei jūros santykis. Papildomas kambario aidas netinka.</small></label>
    {value&&<details className="creator-details" open><summary>Mikrofonas ir aplinkos garsas</summary>
      <div className="creator-two">
        <label className="creator-field"><span>Mikrofonas</span><select className={field} disabled={disabled} value={value.microphone} onChange={e=>update({microphone:e.target.value as SceneAcoustics['microphone']})}><option value="phone_camera">Filmuojančio telefono</option><option value="close_mic">Prie kalbančio žmogaus</option></select></label>
        <label className="creator-field"><span>Atstumas iki žmogaus, m</span><input className={field} disabled={disabled} type="number" min={0.1} max={15} step={0.1} value={value.distanceMeters} onChange={e=>update({distanceMeters:Number(e.target.value)})}/></label>
      </div>
      {voiceMode==='recording'&&<label className="creator-field"><span>Kas jau yra garso įraše?</span><select className={field} disabled={disabled} value={value.referenceContent} onChange={e=>{const referenceContent=e.target.value as SceneAcoustics['referenceContent'];update({referenceContent,ambienceMode:referenceContent==='mixed'?'preserve_reference':'generate_from_scene'});}}><option value="mixed">Balsas ir aplinkos fonas · išlaikyti</option><option value="speech_only">Tik balsas · aplinką kurs Seedance</option></select></label>}
      {value.referenceContent==='speech_only'&&<>
        <label className="creator-field"><span>Aplinkos garsas</span><select className={field} disabled={disabled} value={value.ambienceMode} onChange={e=>update({ambienceMode:e.target.value as SceneAcoustics['ambienceMode']})}><option value="generate_from_scene">Kurti pagal aprašymą</option><option value="none">Tik kalba, be fono</option></select></label>
        {value.ambienceMode==='generate_from_scene'&&<label className="creator-field"><span>Girdimi aplinkos garsai</span><textarea className={field} rows={2} maxLength={1000} disabled={disabled} value={value.soundscape??''} placeholder="Švelnios bangos už žmogaus, lengvas vėjas. Be muzikos." onChange={e=>update({soundscape:e.target.value})}/></label>}
      </>}
      <label className="creator-field"><span>Balso šaltinio skambesys</span><select className={field} disabled={disabled||voiceMode==='clone'} value={value.referenceAcoustics} onChange={e=>update({referenceAcoustics:e.target.value as SceneAcoustics['referenceAcoustics']})}><option value="unknown">Dar neperklausyta / nepatikrinta</option><option value="dry">Perklausyta · nėra kambario aido</option><option value="roomy">Girdimas kambario aidas · reikia taisyti</option></select><small>Jūros fonas kambario aido nepašalina. Netinkamą balso įrašą pirmiausia paruošk iš naujo.</small></label>
    </details>}
  </div>;
}
