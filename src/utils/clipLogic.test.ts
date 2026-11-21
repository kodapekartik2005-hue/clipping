import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssSubtitles,
  buildSmartCropFilter,
  buildTranscriptFromWhisper,
  calculateWordTimings,
  DEFAULT_CAPTION_STYLE,
  formatTimecode,
  parseYouTubeUrl,
  snapClipBoundaries,
  trimClipSilenceBoundaries,
} from './clipLogic';

test('parseYouTubeUrl validates standard, shorts, and mobile URLs', () => {
  const watch = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(watch.valid, true);
  assert.equal(watch.videoId, 'dQw4w9WgXcQ');

  const shortUrl = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=12');
  assert.equal(shortUrl.valid, true);
  assert.equal(shortUrl.videoId, 'dQw4w9WgXcQ');

  const shorts = parseYouTubeUrl('https://youtube.com/shorts/abcdefghijk');
  assert.equal(shorts.valid, true);
  assert.equal(shorts.videoId, 'abcdefghijk');

  const badDomain = parseYouTubeUrl('https://vimeo.com/123456');
  assert.equal(badDomain.valid, false);

  const empty = parseYouTubeUrl('   ');
  assert.equal(empty.valid, false);
});

test('buildSmartCropFilter computes centered and speaker-tracked even crop dimensions', () => {
  const centered = buildSmartCropFilter(1920, 1080, '9:16', 0.5, '1080p');
  assert.equal(centered, 'crop=608:1080:656:0,scale=1080:1920:flags=lanczos');

  const leftSpeaker = buildSmartCropFilter(1920, 1080, '9:16', 0.0, '1080p');
  assert.equal(leftSpeaker, 'crop=608:1080:0:0,scale=1080:1920:flags=lanczos');

  const square = buildSmartCropFilter(1920, 1080, '1:1', 0.5, '720p');
  assert.equal(square, 'crop=1080:1080:420:0,scale=720:720:flags=lanczos');
});

test('snapClipBoundaries aligns to sentence edges and enforces 15-60s limits', () => {
  const transcript = [
    { start: 0, end: 8.5, speaker: 'Host', text: 'Intro.' },
    { start: 9.0, end: 21.0, speaker: 'Host', text: 'First core insight.' },
    { start: 21.4, end: 36.2, speaker: 'Host', text: 'Second insight.' },
  ];
  const snapped = snapClipBoundaries(10.2, 35.0, transcript, 120, 15, 60);
  assert.equal(snapped.start, 9.0);
  assert.equal(snapped.end, 36.2);
  assert.ok(snapped.end - snapped.start >= 15 && snapped.end - snapped.start <= 60);
});

test('calculateWordTimings produces monotonic word timestamps', () => {
  const words = calculateWordTimings('Focus creates viral hooks!', 10, 13);
  assert.equal(words.length, 4);
  assert.equal(words[0].start, 10);
  assert.equal(words[words.length - 1].end, 13);
  assert.equal(words[3].emphasis, true);
});

test('buildAssSubtitles generates valid ASS dialogue events with highlight colors', () => {
  const ass = buildAssSubtitles(
    [
      {
        id: '1',
        start: 10,
        end: 13,
        text: 'Focus creates results!',
        words: calculateWordTimings('Focus creates results!', 10, 13),
      },
    ],
    DEFAULT_CAPTION_STYLE,
    1080,
    1920,
    10
  );
  assert.ok(ass.includes('[V4+ Styles]'));
  assert.ok(ass.includes('Dialogue: 0,0:00:00.00,'));
  assert.ok(ass.includes('{\\kf'));
  assert.ok(ass.includes('PlayResX: 1080'));
});

test('trimClipSilenceBoundaries trims leading and trailing dead air safely', () => {
  const trimmed = trimClipSilenceBoundaries(
    10,
    40,
    [
      { start: 9.5, end: 13.0 },
      { start: 37.5, end: 41.0 },
    ],
    15
  );
  assert.equal(trimmed.start, 12.75);
  assert.equal(trimmed.end, 37.75);
});

test('buildTranscriptFromWhisper maps segments and exact word timings cleanly', () => {
  const transcript = buildTranscriptFromWhisper(
    [{ start: 0, end: 4.5, text: 'Build real viral clips automatically!' }],
    [
      { word: 'Build', start: 0.1, end: 0.6 },
      { word: 'real', start: 0.65, end: 1.0 },
      { word: 'viral', start: 1.05, end: 1.6 },
      { word: 'clips', start: 1.65, end: 2.2 },
      { word: 'automatically!', start: 2.25, end: 4.3 },
    ],
    30
  );
  assert.equal(transcript.length, 1);
  assert.equal(transcript[0].words?.length, 5);
  assert.equal(transcript[0].words?.[4].emphasis, true);
  assert.equal(transcript[0].words?.[0].start, 0.1);
});

test('formatTimecode formats seconds cleanly', () => {
  assert.equal(formatTimecode(65.4), '01:05.4');
});
