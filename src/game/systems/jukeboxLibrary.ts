export type JukeboxCatalogCategory = 'trap' | 'lofi' | 'retro' | 'urbano_arg' | 'hype';

export type LocalJukeboxSong = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  category: JukeboxCatalogCategory;
  assetPath: string;
};

export type LocalJukeboxFallbackTrack = {
  id: string;
  title: string;
  artist: string;
  assetPath: string;
};

export const LOCAL_JUKEBOX_SONGS: LocalJukeboxSong[] = [
  {
    id: 'a51',
    videoId: 'local:a51',
    title: 'A51',
    artist: 'Waspi World',
    category: 'hype',
    assetPath: '/assets/audio/A51.mp3',
  },
];

export const LOCAL_JUKEBOX_FALLBACK_TRACKS: LocalJukeboxFallbackTrack[] = [
  {
    id: 'morning_haze',
    title: 'Morning Haze',
    artist: 'Waspi World',
    assetPath: '/assets/audio/Morning_Haze.mp3',
  },
];

export function getLocalJukeboxSongsByCategory(category: string): LocalJukeboxSong[] {
  return LOCAL_JUKEBOX_SONGS.filter((song) => song.category === category);
}

export function getLocalJukeboxSongByVideoId(videoId: string): LocalJukeboxSong | null {
  return LOCAL_JUKEBOX_SONGS.find((song) => song.videoId === videoId) ?? null;
}

export function getDefaultJukeboxFallbackTrack(): LocalJukeboxFallbackTrack | null {
  return LOCAL_JUKEBOX_FALLBACK_TRACKS[0] ?? null;
}
