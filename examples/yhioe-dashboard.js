var blessed = require('blessed')
  , contrib = require('../index');

var screen = blessed.screen({
  smartCSR: true,
  useBCE: true,
  cursor: {
    artificial: true,
    blink: true,
    shape: 'underline'
  },
  log: `${__dirname}/application.log`,
  debug: true,
  dockBorders: true
});

const yhioeLogMsg = contrib.yhioeLogMsg;
contrib.yhioeSetScreenRef(screen);

//create layout and widgets

var grid = new contrib.grid({rows: 12, cols: 12, screen: screen});
/*
var donut = grid.set(8, 8, 4, 2, contrib.donut,
  {
  label: 'Memory',
  radius: 16,
  arcWidth: 4,
  yPadding: 2,
  data: [{label: 'Used', percent: 14} ]
})
var gauge = grid.set(8, 10, 2, 2, contrib.gauge, {label: 'Storage', percent: [80,20]})
 */

const yhioeGetMemUsed = () => {
  for (let [dvc, snap] of Object.entries(contrib.yhioeLiveData.devices)) {
    let health = snap.health;
    if (health.hasOwnProperty('yh_memory_used')) {
      return health.yh_memory_used;
    } else {
      yhioeLogMsg('yh_memory_used field not found');
    }
  }
  return 0;
};

var gauge_two = grid.set(2, 9, 2, 3, contrib.gauge, {label: 'Memory',
  percent: yhioeGetMemUsed()});

setInterval(function() {
  gauge_two.setData(yhioeGetMemUsed());
}, 30000);

var connectionCountsLine = grid.set(8, 8, 4, 4, contrib.line,
  { showNthLabel: 5
    , maxY: 100
    , label: 'Connection Counts'
    , showLegend: true
    , legend: {width: 8}});

var bar = grid.set(4, 9, 4, 3, contrib.bar,
  { label: 'Time Spent (%)'
    , barWidth: 4
    , barSpacing: 12
    , xOffset: 2
    , maxHeight: 9});

var connectionsLine =  grid.set(6, 6, 2, 3, contrib.line,
  { label: 'Active Connections'
    , tags: true
    , style: { fg: 'blue', titleFg: 'white' }});

function yhGetTimestamp() {
  var d = new Date();
  var h = d.getHours();
  var hs = (h < 10)? '0' + h : h.toString();
  var M = d.getMinutes();
  var MS = (M < 10)? '0' + M : M.toString();
  return hs + MS;
}

setInterval(function() {
  lcdLineOne = grid.set(0,9,2,3, contrib.lcd,
    {
      label: 'Time',
      segmentWidth: 0.06,
      segmentInterval: 0.11,
      strokeWidth: 0.1,
      elements: 5,
      display: yhGetTimestamp(),
      elementSpacing: 4,
      elementPadding: 2
    });
}, 60000);

var lcdLineOne = grid.set(0,9,2,3, contrib.lcd,
  {
    label: 'Time',
    segmentWidth: 0.06,
    segmentInterval: 0.11,
    strokeWidth: 0.1,
    elements: 5,
    display: yhGetTimestamp(),
    elementSpacing: 4,
    elementPadding: 2
  }
);
var errorsLine = grid.set(0, 6, 4, 3, contrib.line,
  { style:
          { line: 'red'
            , text: 'white'
            , baseline: 'black'}
  , label: 'Errors Rate'
  , maxY: 60
  , showLegend: true });
var activityTable = grid.set(0, 0, 5, 9, contrib.table,
  { keys: true
    , fg: 'green'
    , label: 'Activity'
    , columnSpacing: 1
    , columnWidth: [25, 35, 10, 10]});

var cmdbox = grid.set(5, 0, 1, 9, contrib.inputbox,
  {label: 'Command'});
var textbox = cmdbox.getTextbox();
textbox.setValue('Enter username to connect...');
textbox.on('submit', (text) => {
  contrib.yhioeModuleSM(text,
    textbox,
    yhioeSetActivityTableData);
});
textbox.on('focus', () => {
  textbox.clearValue();
});
contrib.yhioeSetTextboxRef(textbox);

var map = grid.set(6, 0, 6, 6, contrib.map, {label: 'Destination'});
var log = grid.set(8, 6, 4, 2, contrib.log,
  { fg: 'green'
    , selectedFg: 'green '
    , label: 'Logs'});

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

// fixes https://github.com/yaronn/blessed-contrib/issues/10
screen.on('resize', function() {
  // donut.emit('attach');
  // gauge.emit('attach');
  gauge_two.emit('attach');
  // sparkline.emit('attach');
  bar.emit('attach');
  // table.emit('attach');
  lcdLineOne.emit('attach');
  errorsLine.emit('attach');
  activityTable.emit('attach');
  map.emit('attach');
  log.emit('attach');
  cmdbox.emit('attach');
});

var yhioeConntrackRows = new Map();
const yhioeConntrackHeaders = ['From',
  'To', 'State', 'TimeSpent'];

function isIp(s) {
  return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(s);
}

function yhioeGetTableData(tabledata) {
  var row = tabledata.row;
  var key = tabledata.key;
  var datatableRows = [];
  if (yhioeConntrackRows.has(key)) {
    yhioeConntrackRows.delete(key);
  }
  yhioeConntrackRows.set(key, row);
  for (let [key, drow] of yhioeConntrackRows.entries()) {
    var datatableRow = [];
    var src = (!drow.srcname.length || isIp(drow.srcname))?
      drow.ip4sstr + ':' + drow.sport :
      drow.srcname + ':' + drow.sport;
    if (src.length > 34) {
      src = src.substr(src.length - 25);
    }
    var dst = (!drow.dstname.length || isIp(drow.dstname))?
      drow.ip4dstr + ':' + drow.dport :
      drow.dstname + ':' + drow.dport;
    if (dst.length > 34) {
      dst = dst.substr(dst.length - 34);
    }
    var tmspent = drow.time_spent;
    var state = drow.tcpstate;
    datatableRow.push(src, dst, state, tmspent);
    datatableRows.push(datatableRow);
    /* show on map */
    if (drow.lat.length && drow.lon.length) {
      map.addMarker({'lon' : drow.lon, 'lat' : drow.lat, color: 'yellow', char: 'X' });
    }
  }
  if (datatableRows.length > 20) {
    datatableRows.splice(0,
      datatableRows.length - 20);
  }
  return datatableRows;
}

function yhioeSetActivityTableData(tabledata, errorsifAny) {
  // callback for yhioeClient.js: yhioeRollingTableData
  var errors = errorsifAny?
    errorsifAny.toString().replace('\n', ' ')
    :null;
  if (errors) {
    activityTable.setData({
      headers: yhioeConntrackHeaders,
      data: [[errors, '', '', '']]
    });
  } else {
    // if (yhioeRetryConnect) {
    //     clearInterval(yhioeRetryConnect);
    //     yhioeRetryConnect = null;
    // }
    let rows = yhioeGetTableData(tabledata);
    activityTable.setData({
      headers: yhioeConntrackHeaders,
      data: rows
    });
  }
  // activityTable.focus();
  screen.render();
}

function yhioeGlobalSiteStats() {
  contrib.yhioeRunAcctStats();
  if (contrib.yhioeLiveData.yhAcctStats.hasOwnProperty('global') &&
        contrib.yhioeLiveData.yhAcctStats.global.hasOwnProperty('acct') &&
        contrib.yhioeLiveData.yhAcctStats.global.acct.hasOwnProperty('bySite') &&
        contrib.yhioeLiveData.yhAcctStats.global.acct.bySite.hasOwnProperty('time_spent') ) {
    bar.setData(
      {
        titles: contrib.yhioeLiveData.yhAcctStats.global.acct.bySite.sites.slice(0, 3),
        data: contrib.yhioeLiveData.yhAcctStats.global.acct.bySite.time_spent.slice(0, 3)
      });
  }
  let counts = contrib.yhioeGetUserAndGlobalCounts();
  let globCounts = {
    title: 'Global',
    style: {line: 'red'},
    x: counts.globalCounts.ts,
    y: counts.globalCounts.count
  };
  connectionCountsLine.setData([globCounts], connectionCountsLine);
}

setInterval(function() {
  for (var i = 0; i < contrib.yhioeLiveData.yhioeAppLog.length; i++) {
    log.log(contrib.yhioeLiveData.yhioeAppLog[i]);
  }
  contrib.yhioeLiveData.yhioeAppLog.splice(0);
  screen.render();
}, 500);

setInterval(() => {
  yhioeGlobalSiteStats();
}, 3000);

function yhioeCheckArgs() {
  const cwd = process.cwd();
  var path = require('path');
  process.argv.forEach(function (val, index, array) {
    var secdatapath = null, secdatatagpath = null;
    if (val.indexOf('--secdatapath=') >= 0) {
      secdatapath = val.split('=')[1];
    }
    if (val.indexOf('--secdatatagpath=') >= 0) {
      secdatatagpath = val.split('=')[1];
    }
    if (secdatapath && secdatatagpath) {
      contrib.yhioeLiveData.secDataPath = secdatapath;
      contrib.yhioeLiveData.secDataTagPath = secdatatagpath;
    } else {
      contrib.yhioeLiveData.secDataPath =
        path.join(cwd, '.secData');
      contrib.yhioeLiveData.secDataTagPath =
        path.join(cwd, '.secDataTag');
    }
    yhioeLogMsg('Using ' +
      contrib.yhioeLiveData.secDataTagPath + ' ' +
      contrib.yhioeLiveData.secDataPath);
  });
}

yhioeCheckArgs();
contrib.authenticateAndFetch('/n/g', null,
  yhioeSetActivityTableData, null);
screen.render();
