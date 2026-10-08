// Prompt direction, not undocumented Seedance API parameters or a DSP guarantee.
export interface SceneAcoustics {
  space: 'open_air' | 'interior';
  microphone: 'phone_camera' | 'close_mic';
  distanceMeters: number;
  referenceContent: 'speech_only' | 'mixed';
  ambienceMode: 'preserve_reference' | 'generate_from_scene' | 'none';
  referenceAcoustics: 'unknown' | 'dry' | 'roomy';
  soundscape?: string;
}

export function parseSceneAcoustics(value: unknown): SceneAcoustics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Netinkamas garso erdvės aprašas.');
  const v = value as Record<string, unknown>;
  const fields = ['space','microphone','distanceMeters','referenceContent','ambienceMode','referenceAcoustics','soundscape'];
  if (Object.keys(v).some(k => !fields.includes(k))) throw new Error('Garso erdvės apraše yra nepalaikomų laukų.');
  function pick<T extends string>(field: string, options: T[]): T {
    if (!options.includes(v[field] as T)) throw new Error(`Netinkamas garso pasirinkimas: ${field}.`);
    return v[field] as T;
  }
  const space = pick('space', ['open_air','interior']);
  const microphone = pick('microphone', ['phone_camera','close_mic']);
  const referenceContent = pick('referenceContent', ['speech_only','mixed']);
  const ambienceMode = pick('ambienceMode', ['preserve_reference','generate_from_scene','none']);
  const referenceAcoustics = pick('referenceAcoustics', ['unknown','dry','roomy']);
  if (typeof v.distanceMeters !== 'number' || !Number.isFinite(v.distanceMeters) || v.distanceMeters < 0.1 || v.distanceMeters > 15) throw new Error('Mikrofono atstumas turi būti 0,1–15 m.');
  if (ambienceMode === 'preserve_reference' && referenceContent !== 'mixed') throw new Error('Aplinkos fonui išlaikyti reikia įrašo su aplinkos garsu.');
  if (referenceContent === 'mixed' && ambienceMode !== 'preserve_reference') throw new Error('Įrašui su fonu nekurk antro aplinkos sluoksnio. Atskirk balsą arba išlaikyk esamą foną.');
  if (space === 'open_air' && referenceAcoustics === 'roomy') throw new Error('Balso įraše girdimas kambario aidas. Lauko scenai pirmiausia paruošk ir perklausyk švarų balsą; jūros fonas aido nepanaikina.');
  if (v.soundscape !== undefined && (typeof v.soundscape !== 'string' || v.soundscape.length > 1000)) throw new Error('Girdimų aplinkos garsų aprašas per ilgas arba netinkamas.');
  return { space, microphone, distanceMeters: v.distanceMeters, referenceContent, ambienceMode, referenceAcoustics,
    ...(v.soundscape === undefined ? {} : { soundscape: (v.soundscape as string).trim() }) };
}

export function sceneAudioDirection(profile: SceneAcoustics, hasReference = true) {
  const space = profile.space === 'open_air'
    ? 'Open-air acoustics: the speaker is physically in the outdoor scene. No enclosed-room resonance, room reverb tail, bathroom echo, hall reverb or artificial spacious vocal effect. Do not add a reverb plugin to imply outdoors; any subtle ground reflection must fit the actual terrain, without a room-like decay.'
    : 'Interior acoustics: match reflections and decay to the visible room materials and size; no generic hall preset.';
  const microphone = profile.microphone === 'phone_camera'
    ? `Microphone perspective: on-camera phone microphone approximately ${profile.distanceMeters} m from the speaker, at the filmed camera position. Dialogue and environment are heard from that same position. Use natural conversational projection and dynamics, not an intimate close-mic studio narration pasted over an unrelated ambience bed. Keep words intelligible without making the voice unnaturally detached or booming.`
    : `Microphone perspective: a close microphone approximately ${profile.distanceMeters} m from the speaker. Keep the specified close perspective while matching the visible space.`;
  const reference = hasReference ? 'Preserve reference words, speaker identity/timbre, delivery and pauses. Those performance responsibilities do not require copying the source microphone proximity, EQ, noise floor or room impulse response. Reconstruct the requested scene acoustics around the performance; do not reproduce source room echo as part of the voice identity.' : 'Generate the scripted speech with a consistent speaker identity and the requested delivery, heard inside this scene from the specified microphone position.';
  const ambience = profile.ambienceMode === 'preserve_reference'
    ? 'AMBIENCE RESPONSIBILITY: The audio reference already contains the approved environmental sound. Retain its character and timing. Do not add a second ambience layer, sea loop, new music or additional voices. Adapt vocal acoustic perspective without duplicating the reference background.'
    : profile.ambienceMode === 'generate_from_scene'
      ? `AMBIENCE RESPONSIBILITY: ${hasReference ? 'The reference supplies speech only, not the final environment.' : 'Generate speech and environment together as one scene.'} Generate one coherent environmental layer from the same microphone position: <${profile.soundscape || 'Only natural environmental sounds explicitly requested in the scene.'}>. Maintain believable voice-to-background balance throughout words and pauses; do not turn waves/wind into music or a synth pad.`
      : 'AMBIENCE RESPONSIBILITY: Dialogue only. No environmental bed or invented sound effects.';
  return [space, microphone, reference, ambience].join('\n');
}

export function sceneAudioWarnings(profile: SceneAcoustics, hasReference = true) {
  return [
    'Garso erdvė ir mikrofono atstumas perduodami kaip Seedance instrukcija; API negarantuoja išmatuoto aido ar tikslaus pradinio garso išsaugojimo.',
    ...(hasReference && profile.space === 'open_air' && profile.referenceAcoustics === 'unknown'
      ? ['Balso šaltinio akustika dar nepatikrinta. Perklausyk balsą be jūros fono: kambario skambesys gali persikelti į generuotą video.'] : []),
  ];
}
