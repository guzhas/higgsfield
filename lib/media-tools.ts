import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export async function runMediaTool(tool: 'ffmpeg' | 'ffprobe', args: string[], cwd?: string) {
  try {
    const executable = process.env[tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH']?.trim() || tool;
    return await execute(executable, args, { cwd, timeout: 180_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Install FFmpeg (including ffprobe) and restart the server to inspect and export media.');
    throw new Error('The media file could not be processed. Check its format and try again.');
  }
}

export async function inspectMedia(file: string) {
  const { stdout } = await runMediaTool('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', file]);
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams: { codec_type: string; codec_name?: string; width?: number; height?: number; duration?: string; avg_frame_rate?: string }[] };
  const video = data.streams.find(s => s.codec_type === 'video');
  const audio = data.streams.find(s => s.codec_type === 'audio');
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration);
  const [numerator, denominator] = (video?.avg_frame_rate ?? '').split('/').map(Number);
  const frameRate = numerator / denominator;
  return { duration: Number.isFinite(duration) ? duration : undefined, width: video?.width, height: video?.height, frameRate: Number.isFinite(frameRate) ? frameRate : undefined, hasAudio: Boolean(audio), hasVideo: Boolean(video) };
}
