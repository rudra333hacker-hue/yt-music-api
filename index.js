import { createRequire } from "module";
const require = createRequire(import.meta.url);
const YouTube = require("youtube-sr").default;
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import ytmusic from 'ytmusic_api_unofficial'
import { parse, stringify } from 'flatted';
import { Innertube } from 'youtubei.js';
import { Client, MusicClient } from "youtubei";
const ffmpeg = require('fluent-ffmpeg');
const ffmpeg_path = require('ffmpeg-static');
import ytdl from '@distube/ytdl-core'
import { asyncRoute, removeCircularReferences } from "./utils.js";

const app = express();
const youtube = await Innertube.create();
const client = new Client();
const musicClient = new MusicClient();

// Middleware - MUST BE AT THE TOP FOR OFFLINE VAULT TO WORK
app.use(bodyParser.json());
app.use(cors({ 
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Home Route
app.get('/', (req, res) => {
  res.json({
    message: '😊Welcome to the youtube-music 🎵🎶 API!🎉🎊',
    routes: [
      '/home',
      '/search/suggestions?query={query}',
      '/search/musics?query={query}',
      '/search/artists?query={query}',
      '/music/{youtubeId}',
      '/artists/{artistId}',
      '/stream/{youtubeId}',
    ],
  });
});

app.get('/home', asyncRoute(async (req, res) => {
  const homeContent = await ytmusic.charts('IN'); // Changed to 'IN' for better regional data
  res.json(homeContent);
}));

app.get('/search/suggestions', asyncRoute(async (req, res) => {
  const searchSuggestions = await YouTube.getSuggestions(req.query.query);
  res.json(searchSuggestions);
}));

// FIX: English Song Accuracy & Instrumental Filter
app.get('/search/musics', asyncRoute(async (req, res) => {
  // 1. Query Injection: Append "official audio" to force the algorithm toward original tracks
  const rawQuery = req.query.query;
  const enhancedQuery = `${rawQuery} official audio`;

  const results = await ytmusic.search(enhancedQuery, "SONG", true);
  
  // 2. Strict Backend Sanitization: Drop covers/instrumentals before they even reach your app
  const forbiddenKeywords = ["piano", "instrumental", "karaoke", "tutorial", "midi", "cover", "synthesia"];
  
  const filteredResults = results.filter(track => {
    const title = track.title.toLowerCase();
    // Only keep if title does NOT contain forbidden words
    return !forbiddenKeywords.some(keyword => title.includes(keyword));
  });

  res.json(parse(stringify(filteredResults, removeCircularReferences())));
}));

app.get('/search/artists', asyncRoute(async (req, res) => {
  const artists = await ytmusic.search(req.query.query, "artist", true);
  res.json(artists);
}));

// Detailed Music Info
app.get('/music/:youtubeId', asyncRoute(async (req, res) => {
  const musicData = await client.getVideo(req.params.youtubeId);
  res.json(parse(stringify(musicData, removeCircularReferences())));
}));

// Spotify-Style Artist Hits Route
app.get('/artists/:artistId', asyncRoute(async (req, res) => {
  const artist = await client.findOne(req.params.artistId, { type: "channel" }); 
  res.json(parse(stringify(artist, removeCircularReferences())));
}));

app.get('/lyrics/:youtubeId', asyncRoute(async (req, res) => {
  const lyrics = await musicClient.getLyrics(req.params.youtubeId);
  res.json(lyrics);
}));

// High-Performance Audio Stream
app.get("/stream/:youtubeId", asyncRoute(async (req, res) => {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache streams for 1 hour

  try {
    const info = await ytdl.getInfo(req.params.youtubeId);
    const format = ytdl.chooseFormat(info.formats, { 
        quality: 'highestaudio', 
        filter: 'audioonly' 
    });

    const proc = ffmpeg(format.url)
      .setFfmpegPath(ffmpeg_path)
      .toFormat('mp3')
      .on('error', (err) => {
        console.error('FFmpeg Error:', err.message);
        if (!res.headersSent) res.status(500).send('Stream Processing Error');
      });

    proc.pipe(res, { end: true });
  } catch (error) {
    console.error('Stream Fetch Error:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch YouTube stream' });
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://127.0.0.1:${PORT}`);
});
