var express = require('express')
var fs = require('fs')
var path = require('path')
var request = require('request')
var cheerio = require('cheerio')
var cheerioAdv = require('cheerio-advanced-selectors')
var apicache = require('apicache')
var morgan = require('morgan')
var compression = require('compression')
var rfs = require('rotating-file-stream')
var randomUA = require('random-fake-useragent')
var _ = require('lodash')

cheerio = cheerioAdv.wrap(cheerio)

var app = express()
var cache = apicache.middleware

var logDirectory = path.join(__dirname, 'logs')
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory)
var accessLogStream = rfs.createStream('access.log', {
	interval: '1d',
	path: logDirectory
})
var formats = ":remote-addr [:date[iso]] [method=':method', url=':url', status=':status', user-agent=':user-agent', response-time=':response-time']"

morgan.token('remote-addr', function (req) {
	if (req.headers['cf-connecting-ip']) {
		return req.headers['cf-connecting-ip']
	} else {
		return req.ip || req._remoteAddress || (req.connection && req.connection.remoteAddress) || undefined
	}
})

app.use(morgan(formats, {
	stream: accessLogStream
}))
app.use(morgan(formats))
app.use(compression())
app.use(function (req, res, next) {
	res.header("Access-Control-Allow-Origin", "*")
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
	next()
})

var supportedLangs = [{
	name: "Australia",
	code: "au",
	host: "*.flixable.com"
}, {
	name: "Austria",
	code: "at",
	host: "*.flixable.com"
}, {
	name: "Brazil",
	code: "br",
	host: "*.flixable.com"
}, {
	name: "Canada",
	code: "ca",
	host: "*.flixable.com"
}, {
	name: "Denmarl",
	code: "dk",
	host: "*.flixable.com"
}, {
	name: "Finland",
	code: "fi",
	host: "*.flixable.com"
}, {
	name: "France",
	code: "fr",
	host: "*.flixable.com"
}, {
	name: "Germany",
	code: "dr",
	host: "*.flixable.com"
}, {
	name: "Italy",
	code: "it",
	host: "*.flixable.com"
}, {
	name: "Mexico",
	code: "mx",
	host: "*.flixable.com"
}, {
	name: "Netherlands",
	code: "nl",
	host: "*.flixable.com"
}, {
	name: "Norway",
	code: "no",
	host: "*.flixable.com"
}, {
	name: "Poland",
	code: "pl",
	host: "*.flixable.com"
}, {
	name: "Portugal",
	code: "pt",
	host: "*.flixable.com"
}, {
	name: "Spain",
	code: "es",
	host: "*.flixable.com"
}, {
	name: "Sweden",
	code: "se",
	host: "*.flixable.com"
}, {
	name: "Turkey",
	code: "tr",
	host: "*.flixable.com"
}, {
	name: "United Kingdom",
	code: "uk",
	host: "*.flixable.com"
}, {
	name: "United States",
	code: "us",
	host: "flixable.com"
}]

var flixableCache = {}

var isLangSupported = function (lang) {
	const codes = Object.keys(supportedLangs).map(key => supportedLangs[key].code)
	return _.includes(codes, lang)
}

var checkLang = function (req, res, next) {
	if (isLangSupported(req.params.lang)) {
		next()
	} else {
		res.status(404)
		if (req.accepts('json')) {
			res.send({ error: 'Invalid lang' })
			return
		}

		res.type('txt').send('Invalid lang')
	}
}

var getPath = function (lang, path) {
	return getUrl(lang) + path
}

var getUrl = function (lang) {
	var url = lang.host
	url = url.replace("*", lang.code)
	return "https://" + url + "/"
}

var getImdbId = function (lang, z, i, path) {
	request.get({
		url: getPath(lang, path),
		headers: {
			'Referer': getPath(lang, path),
			'User-Agent': randomUA.getRandom()
		},
		timeout: 10000
	}, function (error, response, html) {
		if (!error) {
			var $ = cheerio.load(html)
			var code = $($(".imdbRatingPlugin")[0]).attr("data-title")

			if (code != undefined && code != "") {
				flixableCache[lang.code].popular[z].items[i].imdbid = code
			}
		}
	})
}

var loadDatas = function () {
	console.log("Reloading cache")
	supportedLangs.forEach((lang, i) => {
		flixableCache[lang.code] = {
			popular: [],
			soon: []
		}

		request.get({
			url: getPath(lang, "popular"),
			headers: {
				'Referer': getUrl(lang),
				'User-Agent': randomUA.getRandom()
			},
			timeout: 10000
		}, function (error, response, html) {
			var json = []
			if (!error) {
				var $ = cheerio.load(html)
				var els = $("main > .container > .row")
				var z = 0
				var x = 0
				els.each(function (i, elem) {
					if (i % 3 == 1) {
						json.push({
							name: $(elem).find("h2").text(),
							items: []
						})

						z++
					} else {
						$(elem).find(".poster-container").each(function (i2, elem2) {
							json[(z - 1)].items.push({
								img: $(elem2).find("img").attr("src"),
								title: $(elem2).find("img").attr("alt"),
								imdbid: null
							})

							getImdbId(lang, (z - 1), json[(z - 1)].items.length - 1, $(elem2).find(".poster-link").attr("href").substr(1))
						})
					}
				})
				json.pop()
			}
			flixableCache[lang.code].popular = json
		})

		request.get({
			url: getPath(lang, "coming-soon"),
			headers: {
				'Referer': getUrl(lang),
				'User-Agent': randomUA.getRandom()
			},
			timeout: 10000
		}, function (error, response, html) {
			var json = []
			if (!error) {
				var $ = cheerio.load(html)
				var els = $("main > .container > .row")
				var z = 0
				els.each(function (i, elem) {
					var title = $(elem).find("h2").text().trim()
					if (title != "") {
						json.push({
							name: title,
							items: []
						})
						z++
					} else {
						$(elem).find(".poster-container-large").each(function (i2, elem2) {
							json[(z - 1)].items.push({
								img: $(elem2).find("img").attr("src"),
								title: $(elem2).find("img").attr("alt"),
								description: $($(elem2).parent().find("p")[1]).text(),
								genres: $($(elem2).parent().find("p")[2]).text().trim().split("\n        ·\n        "),
							})
						})
					}
				})
			}
			flixableCache[lang.code].soon = json
		})

	})
}

loadDatas()
setInterval(loadDatas, 1000 * 60 * 60 * 24)

app.get('/', function (req, res) {
	res.send({
		name: 'Fixable Unofficial Api',
		version: "1.0.0"
	})
})

app.get('/:lang/popular', checkLang, cache('1 day'), function (req, res) {
	var lang = _.find(supportedLangs, function (obj) {
		return obj.code === req.params.lang
	})

	res.json(flixableCache[lang.code].popular)
})

app.get('/:lang/coming-soon', checkLang, cache('1 day'), function (req, res) {
	var lang = _.find(supportedLangs, function (obj) {
		return obj.code === req.params.lang
	})

	res.json(flixableCache[lang.code].soon)
})

app.get('/langs', cache('1 day'), function (req, res) {
	res.json(supportedLangs)
})

app.get('/refresh', function (req, res) {
	loadDatas()
	res.json({ ok: true })
})

app.listen('8080')
console.log('Listening on localhost:8080')
exports = module.exports = app