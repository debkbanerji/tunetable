let fs = require('fs');
const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const querystring = require('querystring');
const firebase = require('firebase');

console.log('Running api.js');

spotifyCredentials = JSON.parse(fs.readFileSync('spotify-credentials.json'));
firebaseCredentials = JSON.parse(fs.readFileSync('firebase-credentials.json'));
const firebaseApp = firebase.initializeApp(firebaseCredentials);
const database = firebaseApp.database();

const spotify_client_id = spotifyCredentials['clientId']; // Your client id
const spotify_client_secret = spotifyCredentials['clientSecret']; // Your secret
const spotify_redirect_uri = spotifyCredentials['redirectUri']; // Your redirect uri

const router = express.Router();

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
let generateRandomString = function (length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

let stateKey = 'spotify_auth_state';

// var app = express();

// app.use(express.static(__dirname + '/public'))
//     .use(cookieParser());

// login logic

router.get('/login', function (req, res) {

    const state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    let scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative' +
        ' playlist-modify-public playlist-modify-private';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotify_client_id,
            scope: scope,
            redirect_uri: spotify_redirect_uri,
            state: state
        }));
});

router.get('/auth-callback', function (req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: spotify_redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(spotify_client_id + ':' + spotify_client_secret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function (error, response, body) {
            if (!error && response.statusCode === 200) {

                const access_token = body.access_token,
                    refresh_token = body.refresh_token;

                const options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: {'Authorization': 'Bearer ' + access_token},
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function (error, response, body) {
                    // console.log(body);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                console.log(error);
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

router.get('/refresh_token', function (req, res) {

    // requesting access token from refresh token
    const refresh_token = req.query.refresh_token;
    const authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {'Authorization': 'Basic ' + (new Buffer(spotify_client_id + ':' + spotify_client_secret).toString('base64'))},
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});

processAlbum = function (albumId, accessToken) {

    const requestURL = 'https://api.spotify.com/v1/albums/' + albumId;

    request({
        url: requestURL,
        method: 'GET',
        auth: {
            'bearer': accessToken
        }
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const albumInfo = JSON.parse(body);
            const artistID = albumInfo.artists[0].id;

            request({
                url: 'https://api.spotify.com/v1/artists/' + artistID,
                method: 'GET',
                auth: {
                    'bearer': accessToken
                }
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    const artistInfo = JSON.parse(body);
                    const genres = artistInfo.genres;

                    addAlbumToDatabase(albumInfo, genres);
                } else {
                    console.log(error);
                    console.log(response);
                }
            });
        } else {
            console.log(error);
            console.log(response);
        }
    });
};

processArtist = function (artistId, accessToken) {
    request({
        url: 'https://api.spotify.com/v1/artists/' + artistId + '/albums',
        method: 'GET',
        auth: {
            'bearer': accessToken
        }
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const artistAlbumInfo = JSON.parse(body).items;
            for (let album of artistAlbumInfo) {
                processAlbum(album.id, accessToken);
            }
        } else {
            console.log(error);
            console.log(response);
        }
    });
};

// processSong = function (songId, accessToken) {
//     request({
//         url: 'https://api.spotify.com/v1/tracks/' + songId,
//         method: 'GET',
//         auth: {
//             'bearer': accessToken
//         }
//     }, function (error, response, body) {
//         if (!error && response.statusCode === 200) {
//             const artistInfo = JSON.parse(body).artists[0];
//             request({
//                 url: 'https://api.spotify.com/v1/artists/' + artistInfo.id + '/albums',
//                 method: 'GET',
//                 auth: {
//                     'bearer': accessToken
//                 }
//             }, function (error, response, body) {
//                 if (!error && response.statusCode === 200) {
//
//                 } else {
//                     console.log(error);
//                     console.log(response);
//                 }
//             });
//         } else {
//             console.log(error);
//             console.log(response);
//         }
//     });
// };

router.post('/add-album/:id', function (req, finalRes) {
    const albumId = req.params.id;
    const accessToken = req.body.access_token;
    processAlbum(albumId, accessToken);
});

router.post('/add-artist/:id', function (req, finalRes) {
    const artistId = req.params.id;
    const accessToken = req.body.access_token;
    processArtist(artistId, accessToken);
});

router.post('/add-song/:id', function (req, finalRes) {
    const songId = req.params.id;
    const accessToken = req.body.access_token;
    addSong(songId, accessToken);
});

addAlbumToDatabase = function (album, genres) {
    const tracks = album.tracks.items;
    // const songData = [];
    for (let i = 0; i < tracks.length; i++) {
        addSongToDatabase(tracks[i].id, tracks[i].duration_ms, genres, function () {
            // console.log('added track ' + tracks[i].id);
        })
    }


    // for (let i = 0; i < genres.length; i++) {
    //     database.ref('genre-directory/' + genres[i]).set(genres[i]);
    //     for (let j = 0; j < songData.length; j++) {
    //         database.ref('song-ids/' + genres[i] + '/' + songData[j].id).set(songData[j]);
    //     }
    // }
};

addSongToDatabase = function (song_id, duration_ms, genres, callback) {
    database.ref('song-ids/' + genres[0] + '/' + song_id).once('value').then(function (snapshot) {
        if (snapshot.val() === null) {
            const randomKey = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const song = {
                'id': song_id,
                'random-key': randomKey,
                'duration-sec': duration_ms / 1000
            };
            const numSongsRef = database.ref('num-songs');

            for (let i = 0; i < genres.length; i++) {
                database.ref('genre-directory/' + genres[i]).set(genres[i]);
                database.ref('song-ids/' + genres[i] + '/' + song_id).set(song)
                    .then(function () {
                        if (i === 0) {
                            numSongsRef.transaction(function (current_value) {
                                return (current_value || 0) + 1;
                            });
                        }
                    })
                    .then(callback);
            }
        }
    });

};


router.post('/process-top-songs/', function (req, res) {
    const accessToken = req.body.access_token;
    const topSongsLines = (fs.readFileSync('regional-global-daily-latest.csv', 'utf8')).split('\n');
    let ids = [];
    for (let i = 1; i < topSongsLines.length - 2; i++) {
        const line = topSongsLines[i];
        const splitLine = line.split(',');
        const songURLSplit = (splitLine[splitLine.length - 1]).split('/');
        ids.push(songURLSplit[songURLSplit.length - 1]);
    }
    recursivelyAddSongs(ids, 0, accessToken)
});

recursivelyAddSongs = function (ids, index, accessToken) {

    // console.log('Adding ' + ids[index]);
    if (index < ids.length) {
        setTimeout(function () {
                addSong(ids[index], accessToken, function () {
                    recursivelyAddSongs(ids, index + 1, accessToken);
                })
            }, 1000
        );
    }
};

addSong = function (songId, access_token, callback, errorCallback) {
    const requestURL = 'https://api.spotify.com/v1/tracks/' + songId;

    request({
        url: requestURL,
        method: 'GET',
        auth: {
            'bearer': access_token
        }
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const songInfo = JSON.parse(body);
            const artistID = songInfo.album.artists[0].id;
            request({
                url: 'https://api.spotify.com/v1/artists/' + artistID,
                method: 'GET',
                auth: {
                    'bearer': access_token
                }
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    const artistInfo = JSON.parse(body);
                    const genres = artistInfo.genres;

                    addSongToDatabase(songId, songInfo.duration_ms, genres, function () {

                    });
                    if (callback) {
                        callback(songInfo.name);
                    }
                } else {
                    console.log(error);
                    console.log(response);
                }
            });
        } else {
            console.log(error);
            console.log(response);

            // errorCallback();
        }
    });
};

shuffle = function (a) {
    let j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a; // Note: This is an in place shuffle, so a return statement is not necessary
};

router.get('/genre-list', function (req, res) {
    database.ref('/genre-directory').once('value').then(function (snapshot) {
        const genreList = Object.keys(snapshot.val());
        res.send(genreList);
    });
});

router.post('/create-playlist', function (req, finalRes) {
    const accessToken = req.body.access_token;
    const userID = req.body.user_id;
    const targetLengthSec = req.body.target_length_mins * 60;
    const playlistName = req.body.playlist_name;
    const genreBreakdown = JSON.parse(req.body.genre_breakdown);
    const genres = Object.keys(genreBreakdown);

    for (let i = 0; i < genres.length; i++) {
        const genre = genres[i];
        genreBreakdown[genre] = Number(genreBreakdown[genre]);
        if (genreBreakdown[genre] === 0) {
            delete genreBreakdown[genre];
        }
    }
    let totalLength = 0;
    for (let i = 0; i < genres.length; i++) {
        const genre = genres[i];
        totalLength += genreBreakdown[genre];
    }

    let lengthThresholds = [];
    for (let i = 0; i < genres.length; i++) {
        const genre = genres[i];
        let length = genreBreakdown[genre];
        lengthThresholds[i] = Math.round(targetLengthSec * length / totalLength);
        if (i > 0) {
            lengthThresholds[i] += lengthThresholds[i - 1];
        }
    }
    const result = [];
    const resultSet = new Set();

    createPlaylist(genres, 0, lengthThresholds, accessToken, userID, result, resultSet, 0, playlistName, finalRes)
});

function createPlaylist(genres, genreIndex, lengthThresholds, accessToken, userID, result, resultSet, currLength, playlistName, finalRes) {
    if (genreIndex >= genres.length) {
        const createPlaylistOptions = {
            url: 'https://api.spotify.com/v1/users/' + userID + '/playlists',
            body: JSON.stringify({
                'name': playlistName,
                'public': true
            }),
            dataType: 'json',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
            }
        };

        request.post(createPlaylistOptions, function (error, response, body) {
            if (!error) {
                const playlistID = JSON.parse(body).id;
                finalRes.send(playlistID);
                addSongsToPlaylist(shuffle(result), 0, userID, playlistID, accessToken)
            } else {
                console.log(error);
                finalRes.send(-1);
            }
        });
    } else {
        database.ref('num-songs').once('value').then(function (snapshot) {
            const numSongs = snapshot.val();
            const startIndex = Math.floor(Math.random() * numSongs);
            const numSongsToPull = Math.ceil((lengthThresholds[genreIndex] - currLength) / 150);
            database.ref('/song-ids/' + genres[genreIndex])
                .orderByChild('random-key')
                .startAt(startIndex)
                .limitToFirst(numSongsToPull)
                .once('value').then(function (snapshot) {
                const genreSongs = shuffle(Object.values(snapshot.val()));
                let newSongsAvailable = false;
                for (let i = 0; i < genreSongs.length; i++) {
                    newSongsAvailable = newSongsAvailable || (!resultSet.has(genreSongs[i].id));
                }

                let i = 0;

                let thisGenreSet = new Set();

                while (currLength < lengthThresholds[genreIndex]) {
                    const id = genreSongs[i].id;
                    if (!newSongsAvailable || !resultSet.has(id)) {
                        thisGenreSet.add(id);
                        result.push('spotify:track:' + id);
                        currLength += genreSongs[i]['duration-sec'];
                    }
                    i = (i + 1) % genreSongs.length;
                }
                for (let item of thisGenreSet) resultSet.add(item);
                createPlaylist(genres, genreIndex + 1, lengthThresholds, accessToken, userID, result, resultSet, currLength, playlistName, finalRes);
            });
        });
    }
}

function addSongsToPlaylist(allSongIDs, index, userID, playlistID, accessToken) {
    if (index >= allSongIDs.length) {
        return;
    }
    let requestSongIDs = [];
    const limit = index + 99;
    while (index < Math.min(limit, allSongIDs.length)) {
        requestSongIDs.push(allSongIDs[index]);
        index += 1;
    }

    let populatePlaylistOptions = {
        url: 'https://api.spotify.com/v1/users/' + userID + '/playlists/' + playlistID + '/tracks',
        body: JSON.stringify(requestSongIDs),
        dataType: 'json',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
        }
    };
    request.post(populatePlaylistOptions, function (error, response, body) {
        if (!error) {
            addSongsToPlaylist(allSongIDs, index, userID, playlistID, accessToken);
        } else {
            console.log(error);
        }
    });
}

console.log('Set express router');

console.log('Using body parser');

router.use(bodyParser.json());       // to support JSON-encoded bodies
router.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

console.log('Defining Functions');

console.log('Exporting router');
module.exports = router;
