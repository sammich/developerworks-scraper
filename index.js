const fs = require('fs'),
	path = require('path'),
	moment = require('moment'),
	Crawler = require('crawler'),
	ProgressBar = require('progress'),
	sanitize = require('sanitize-filename')

const outputDir = 'output',
    outputHtmlDir = path.join(outputDir, 'htmls'),
    defaultTopicsPerPage = 25,
    c = new Crawler({ maxConnections: 10, timeout: 100000 }),
	forumId = '11111111-0000-0000-0000-000000002382', // it's in the URL
	baseUrl = 'https://www.ibm.com/developerworks/community/forums/html/forum?id=' + forumId,
	me = '', // your user ID here - you can find it by inspecting your profile vCard in the browser tools

	topics = []

let statusBar

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir)
}

if (!fs.existsSync(outputHtmlDir)) {
    fs.mkdirSync(outputHtmlDir)
}

start()

//

function start() {
    console.log(`Start Scraper - loading initial forum page to get total page count (assuming default of ${defaultTopicsPerPage} topics per page`)
    
    c.queue([{
        uri: baseUrl,
        callback: (error, res, done) => {
            if (error) {
                console.error(error)
            } else {
                const pageCount = +res.$('.forumPagedList[numPages]')[0].attribs.numpages
                
                console.log(`Found ${pageCount} pages`)
                
                loadAllTopicIndex(pageCount)
            }
            
            done()
        }
    }])
}

function loadAllTopicIndex(pageCount) {
    console.log(`Loading mega topic page with every topic (~${pageCount * defaultTopicsPerPage}) on it - this may take some time (if this fails, increase the timeout)`)
    
    c.queue([{
        uri: baseUrl + '&ps=' + pageCount * defaultTopicsPerPage,
        callback: (error, res, done) => {
            if (error) {
                console.error(error)
            } else {
                const topics = res.$('.forumPagedList tr.normalTopic h4 a')
    
                console.log(`Megatopic page loaded - total of ${topics.length} topics found`);
    
                topics.each((i, a) => {
                    let latestPostOn = res.$(a).closest('td').parent().find('.lotusLastCell .formatDate').text().trim()

                    if (latestPostOn[0] !== '2') {
                        latestPostOn = latestPostOn.slice(1)
                    } // there's a weird char at the front

                    loadTopic({
                        url: a.attribs.href.trim(),
                        name: a.children[0].data.trim(),
                        latestPostOn: moment(latestPostOn)._d
                    })
                })

                statusBar = new ProgressBar('Scraping pages [:bar] :percent :etas [:current/:total]', {
                    complete: '.',
                    incomplete: ' ',
                    width: 50,
                    total: topics.length
                })

                c.on('drain', () => {
                    writeIndexPage()
                })
            }
            
            done()
        }
    }])
}

function loadTopic(topic) {
    c.queue([{
        uri: topic.url,
        callback: (error, res, done) => {
            if (error) {
                console.error(error)
            } else {
                const fileName = sanitize(topic.name + '.html'),
                    createdDateDisplay = parseLotusDate(res, '.lotusPost .lotusMeta .formatDateTitle')
                
                res.$('.forumResolvedQuestionIndicator, .forumNotResolvedQuestionIndicator, .forumPostActionToolBarIndicator, .lotusHidden').remove()

                fs.writeFileSync(path.join(outputHtmlDir, fileName), res.$('.forumQuestion').html())

                topic.filename = fileName
                topic.createdOn = moment(createdDateDisplay)._d
                topic.createdDateDisplay = createdDateDisplay
                topic.participants = {}

                res.$('.lotusPerson').each((i, o) => {
                    const userId = res.$(o).next().text().trim()

                    topic.participants[userId] = res.$(o).text().trim()

                    if (userId === me) {
                        topic.hasMe = true
                    }
                })

                topics.push(topic)
            }
    
            statusBar.tick()
            done()
        }
    }])
}

function writeIndexPage() {
    if (me) {
    	fs.writeFileSync(path.join(outputDir, 'justMe.html'), buildRows(true))
    }

    fs.writeFileSync(path.join(outputDir, 'everything.html'), buildRows())

    //
    
    function buildRows(justMe) {
        return wrapTable(topics.map(topic => {
            if (justMe && !topic.hasMe) return ''

            return '<tr>' +
                `<td><a href="htmls/${topic.filename}">${topic.name}</a></td>` +
                `<td>${Object.keys(topic.participants).length} ${topic.hasMe ? '*' : ''}</td>` +
                `<td>${moment(topic.createdOn).format('ll')} (${moment(topic.createdOn).fromNow()})</td>` +
                `<td>${moment(topic.latestPostOn).format('ll')} (${moment(topic.latestPostOn).fromNow()})</td>` +
                '</tr>'
        }).join(''))
    }

    function wrapTable(body) {
        return '<table>' +
            '<thead><tr>' +
                '<th>Topic</th>' +
                '<th>Participants</th>' +
                '<th>Created</th>' +
                '<th>Last Post</th>' +
            '</tr></thead>' +
            '<tbody>' + body + '</tbody></table>'
    }
}

function parseLotusDate(win, selector) {
    let createdDateDisplay = win.$(selector).eq(0).text().trim()
    if (createdDateDisplay[0] !== '2') {
        createdDateDisplay = createdDateDisplay.slice(1)
    } // there's a weird char at the front
}
