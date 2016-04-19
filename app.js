var request = require('request');
var fetchfeed = require('./fetchfeed.js');
var spider = new fetchfeed();
var feedDict = require('./rss-list.json').remote;

var feedNames = Object.keys(feedDict);
var feeds = Object.keys(feedDict).map(function(x) {return feedDict[x]});
console.log(feeds);
console.log("Total Feed:"+" "+feeds.length);
var checkNewsInterval;

var REFRESH_DELAY = 15000;

function fetchFeeds(callback) {
  spider.fetchSourceFromStream(feeds, request, callback);
}

spider.fetchSourceFromStream(feeds, request, storeArticleDates);
checkNewsInterval = setInterval(function() {
  fetchFeeds(emitArticleIfNew);
}, REFRESH_DELAY);

var mostRecentDateFromFeed = {};
var mostRecentDateRunning = {};
//var source_from = 'spider';

function constructSmallArticle(article) {
  var newItem = {
    title: article.title,
    author: article.author,
    category:article.categories,
    description: article.description,
    media: article.image,
    created_at: article.pubdate,
    updated_at: new Date(article.date),
    guid: article.guid,
    link: article.link,
    channel:'indonesia',
    city:'jakarta',
    language:article.meta.language,
    meta:{
      metatitle: article.meta.title,
      metadescription: article.meta.description,
      metalink: article.meta.link,
      language:article.meta.language,
      copyright:article.meta.copyright,
      image:article.meta.image
    }
    //source_from: source_from
  };

  if (newItem.metalink == null)
    newItem.metalink = newItem.link;

    if (newItem.metadescription == null)
      newItem.metadescription = newItem.description;

  if (newItem.date > new Date())
    newItem.date = new Date();

  return newItem;

}

function storeArticleDates(err, article) {
  if (err) {
    console.error(err);
    return;
  }

  if (article.hasOwnProperty('end')) {
    return;
  }

  var articleDate = article.date;
  if (mostRecentDateFromFeed[article.meta.title] == null ||
      mostRecentDateFromFeed[article.meta.title] < articleDate) {
    mostRecentDateFromFeed[article.meta.title] = articleDate;
    mostRecentDateRunning[article.meta.title] = articleDate;
  }
}

function emitArticleIfNew(err, article) {
  if (err) {
    console.error(err);
    return;
  }

  if (article.hasOwnProperty('end')) {
    mostRecentDateFromFeed[article.end] = mostRecentDateRunning[article.end];
    return;
  }

  var lastArticleSentDate = mostRecentDateFromFeed[article.meta.title];
  if (article.date > lastArticleSentDate) {
    console.log(article.image);
    var newItem = constructSmallArticle(article);
    io.emit('Spider items', JSON.stringify([newItem]));

    /////save to mongodb
    Post.add(newItem, function(err, post){
      if(err) console.log('Get content error:', err);

      console.log('Write to mongo successed. callback=', post);
    });


    if (newItem.date > mostRecentDateRunning[newItem.metatitle])
      mostRecentDateRunning[newItem.metatitle] = newItem.date;

  }

}

function emitArticle(socket) {
  return function(err, article) {
    if (err) {
      console.error(err);
      return;
    }

    if (article.hasOwnProperty('end')) {
      return;
    }
    var newItem = constructSmallArticle(article);
    socket.emit('Spider items', JSON.stringify([newItem]));
  }
}

////////////=======================================
/* Server */
var express = require('express');
var mongoose   = require('mongoose');
var bodyParser = require('body-parser');
var path = require('path');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);


mongoose.connect('mongodb://localhost:27017/Sumber_Api');

///////
var mongoose = require('mongoose');
var	Schema = mongoose.Schema;
	Post = module.exports;

var PostSchema = new Schema({
	title: { type: String},
  author: { type: String},
  category: { type: String},
  description: { type: String},
  media : { type : Array , "default" : [] },
  created_at:  { type: String},
  updated_at:  { type: String},
  guid:  { type: String},
  link:  { type: String},
  channel:{ type: String},
  city:{ type: String},
  language:{ type: String},
  meta : {
    metatitle:{ type: String},
    metadescription:{ type: String},
    metalink:{ type: String},
    language:{ type: String},
    copyright: { type: String},
    image : { type : Array , "default" : [] }
  },
  extra:{
      source_from : { type : String , default:'spider'},
      read: {type: Boolean, default:false}
  }
});

mongoose.model('Articles', PostSchema);

var PostModel = mongoose.model('Articles');

Post.add = function(post, callback){
	new PostModel(post).save(callback);
}


///==================================

app.set('port', (process.env.PORT || 5000));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

http.listen(app.get('port'), function() {
  console.log("Spider app is running at localhost:" + app.get('port'));
});

var numberOfUsers = 0;

/* Socket */
io.on('connection', function(socket) {
  numberOfUsers++;
	console.log("User connected", socket.id);
  emitNumberOfUsers(numberOfUsers);
  emitSourceList(feedNames);

  if (process.env.EMIT_NOW) {
    console.log('emitting now');
    fetchFeeds(emitArticle(socket));
  }

  socket.on('disconnect', function() {
    numberOfUsers--;
  	console.log("User disconnected", socket.id);
    emitNumberOfUsers(numberOfUsers);
  });
});

/* Broadcasting */
function emitNumberOfUsers(num) {
  console.log('User count', num);
  var numOtherUsers = num === 0 ? 0 : num - 1;
  io.emit('Spider readers', numOtherUsers);
}

function emitSourceList(feedList) {
  io.emit('Spider sources', JSON.stringify(feedList));
}
