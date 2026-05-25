export interface KlingAuthHeaders {
  Authorization: string;
  'Content-Type': string;
}

export interface KlingGenerateParams {
  prompt: string;
  duration: number;
  ratio: string;
  camera_control: string;
  cfg_scale: number;
  audio: boolean;
}

export const validateKlingParams = (params: KlingGenerateParams) => {
  const errors: string[] = [];
  if (params.prompt.length > 100) errors.push(`Prompt too long (${params.prompt.length} chars, max 100)`);
  if (![5, 10].includes(params.duration)) errors.push(`Invalid duration (${params.duration}s, only 5/10s supported)`);
  if (!['16:9', '9:16', '1:1'].includes(params.ratio)) errors.push(`Invalid ratio (${params.ratio}, only 16:9/9:16/1:1 supported)`);
  if (!['none', 'push', 'pull', 'left', 'right', 'up', 'down'].includes(params.camera_control)) errors.push(`Invalid camera control (${params.camera_control})`);
  if (params.cfg_scale < 0.5 || params.cfg_scale > 2.0) errors.push(`Invalid CFG scale (${params.cfg_scale}, must be 0.5-2.0)`);
  return errors;
};
