const querystring = require('querystring');
const https = require("https");
const os = require('os');
var path = require('path');
const fs = require('fs');
const crypto = require('crypto');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const YHIOE_WARNING = 'warning';
const YHIOE_ERROR = 'error';
const YHIOE_INFO = 'info';
const YHIOE_DEBUG = 'debug';
const YH_STATE_INITIAL = 0;
const YH_STATE_USERNAME_ENTERED = 1;
const YH_STATE_PASSWORD_ENTERED = 2;
const YH_STATE_EMAIL_ENTERED = 3;
const YH_STATE_ENDPOINT_ENTERED = 4;
const YH_STATE_LOGGED_IN = 5;
const YH_STATE_ERROR = -1;
var yhioeLogCb = null;
var screen = null;
var textbox = null;

const authpost = (host, port, path, cookie, data, cb, cbarg) => {
    var postData = querystring.stringify(data);
    var options = {
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length,
            'User-Agent': 'UNpkl/1',
            'Cookie': cookie,
            'Connection': 'Keep-Alive'
        }
    };
    var req = https.request(options, (res) => {
        // console.log('statusCode:', res.statusCode);
        // console.log('headers:', res.headers);
        if (textbox) textbox.setValue('status ' +
            res.statusCode + ' path ' + path);
        yhioeLogMsg('status ' + res.statusCode +
            ' path ' + path);
        res.on('data', (d) => {
            var x = d.toString();
            yhioeLogMsg('endpoint ' + path + ' response ' + x);
            switch(path) {
              /*
               * TODO:for love of whatever.. reverse this
               * so that all of this is uniformly wrapped
               * in cb(cbarg) and rid this ugliness
               */
            default:
                if (cb) {
                    yhioeLogMsg('calling cb');
                    cb(x, cbarg);
                }
            }
        });
    });
    req.write(postData);
    req.on('error', (e) => {
        // console.error(e);
    });
    req.end();
};

function getObjectIfValidJson(str) {
    var obj = null;
    try {
        obj = JSON.parse(str);
    } catch (e) {
        return null;
    }
    return obj;
}

function yhioeRmPunct(s, replaceChar) {
    var orig = s.toString();
    return orig.replace(/[.,\/#!$%\^&\*;:{}=\-_`~() ]/g,
        replaceChar).replace(/\s{2,}/g, replaceChar);
}

function yhioeGetConntrackIndx(row) {
    return yhioeRmPunct(row.ip4sstr, "_") + '__' +
        row.sport + '__' +
        yhioeRmPunct(row.ip4dstr, "_") + '__' +
        row.dport;
}

const yhioeSetScreenRef = (s) => {
    screen = s;
}
const yhioeSetTextboxRef = (t) => {
    textbox = t;
}

const yhioeLogMsg = (msg, msgtype) => {
    var type = msgtype? msgtype : "I";
    var f = path.basename(__filename);
    var stack = new Error().stack

    var stackArr = stack.split('\n');
    var i, fun, lineno;
    var yhStack = [];
    for (i = 2; i < stackArr.length; i++) {
        var toks = stackArr[i].split(/\s+/);
        if (toks.length < 4) {
            continue;
        }
        fun = toks[2];
        lineno = toks[3].split(':')[1];
        if (toks[3].indexOf(f) > 0) {
            if (fun.indexOf('Object.<anonymous>') >= 0) {
                fun = f;
            }
            yhStack.push(fun + ':' + lineno);
        }
    }
    var stackLog = f + ' ' + yhStack.join(' <- ');
    var prefix = type[0].toUpperCase() + '.' + ' ' + yhGetTimestamp();
    stackLog = prefix + ' ' + stackLog + ' ' + msg + '\n';
    if (screen) {
        screen.log(stackLog);
    } else {
        console.log(stackLog);
    }
    return stackLog.slice(0, -1);
};

/*
    { conntrackKey: row, conntrackKey1: row }
 */
var yhioeLiveData = {
    listOfRecords: [],
    jsonData: '',
    yhioeConntrackObj: {},
    yhioeAcctByTag: {},
    yhioeAcctBySite: {},
    yhioeAcctByUsr: {},
    yhAcctStats: {},
    yhioeConnCt: {byUser: {}, global: {}},
    yhioeAppLog: [],
    connection: {url: "", host: "127.0.0.1", port: "44433", endpoint: "/n/g"},
    credentials: {email: "", user: "", password: "", cookie: ""},
    secDataPath: null,
    secDataTagPath: null,
    devices: {},             // { device_id: { snapshot: {},  health: {} }
    device_health: [],       // unsorted [{device_id: '', yh_memory_used: 0 ...}]
    state: YH_STATE_INITIAL
};

var yhioeDefaultTags = {
    facebook: 'social media',
    instagram: 'social media',
    youtube: 'internet video',
    ytimg: 'internet video',
    reddit: 'social media',
    cnn: 'news',
    foxnews: 'news',
    amazon: 'shopping',
    hulu: 'internet video',
    netflix: 'internet video',
    nflx: 'internet video',
    snapchat: 'social media',
    amazonvideo: 'internet video'
}

function yhGetTimestamp() {
    var d = new Date();
    var h = d.getHours();
    var hs = (h < 10)? '0' + h : h.toString();
    var M = d.getMinutes();
    var MS = (M < 10)? '0' + M : M.toString();
    var s = d.getSeconds();
    var ss = (s < 10)? '0' + s : s.toString();
    return hs + ':' + MS + ':' + ss;
}

function yhioeAppLogMsg(type, msg) {
    var t = type[0].toUpperCase() + '.';
    return yhGetTimestamp() + ' ' + t + ' ' + msg;
}

function yhioeAppLog(type, msg) {
    if (!(type && msg)) {
        return yhioeLiveData.yhioeAppLog;
    }
    let m = yhioeAppLogMsg(type, msg);
    yhioeLiveData.yhioeAppLog.push(m);
     if (yhioeLiveData.yhioeAppLog.length > YHIOE_COUNTS_LIMIT) {

     }
     let truncateCt =  yhioeLiveData.yhioeAppLog.length - 10;
     if (truncateCt > 0) {
         yhioeLiveData.yhioeAppLog.splice(0, truncateCt);
     }
     return yhioeLiveData.yhioeAppLog;
}

function yhioeTokenizeDest(row) {
    var rowcopy = {...row};
    if (!rowcopy.dstname.length) {
        return rowcopy;
    }
    let toks = rowcopy.dstname.split('.');
    for (var j = toks.length - 3, i = 1; j >= 0; j--, i++) {
        rowcopy['t' + i] = toks[j];
        if (yhioeDefaultTags.hasOwnProperty(toks[j])) {
            rowcopy.tag = yhioeDefaultTags[toks[j]];
        }
    }
    return rowcopy;
}

function yhioeDnsTokenAcctHelper(parentObject, ctrow) {
    var row = yhioeTokenizeDest(ctrow);
    if (row.hasOwnProperty('tag')) {
        let tag = yhioeRmPunct(row.tag, '_');
        if (parentObject.yhioeAcctByTag.hasOwnProperty(tag)) {
            parentObject.yhioeAcctByTag[tag].time_spent +=
                row.time_spent;
        } else {
            parentObject.yhioeAcctByTag[tag] = {};
            parentObject.yhioeAcctByTag[tag].time_spent =
                row.time_spent;
        }
    }

    if (row.hasOwnProperty('t1')) {
        if (parentObject.yhioeAcctBySite.hasOwnProperty(row.t1)) {
            parentObject.yhioeAcctBySite[row.t1].time_spent +=
                row.time_spent;
        } else {
            parentObject.yhioeAcctBySite[row.t1] = {};
            parentObject.yhioeAcctBySite[row.t1].time_spent =
                row.time_spent;
        }
    }
    /*
    if (row.hasOwnProperty('t2')) {
        if (parentObject.yhioeAcctBySite.hasOwnProperty(row.t2)) {
            parentObject.yhioeAcctBySite[row.t2].time_spent +=
                row.time_spent;
        } else {
            parentObject.yhioeAcctBySite[row.t2] = {};
            parentObject.yhioeAcctBySite[row.t2].time_spent =
                row.time_spent;
        }
    }
    if (row.hasOwnProperty('t3')) {
        if (parentObject.yhioeAcctBySite.hasOwnProperty(row.t3)) {
            parentObject.yhioeAcctBySite[row.t3].time_spent +=
                row.time_spent;
        } else {
            parentObject.yhioeAcctBySite[row.t3] = {};
            parentObject.yhioeAcctBySite[row.t3].time_spent =
                row.time_spent;
        }
    }
    */
}

function yhioeGetSrcKey(row) {
    return row.ip4sstr + '__' + row.srcname;
}

function yhioeDnsTokenAcct(row) {
    var parentObject = yhioeLiveData;
    let srckey = yhioeGetSrcKey(row);
    yhioeDnsTokenAcctHelper(parentObject, row);
    if (yhioeLiveData.yhioeAcctByUsr.hasOwnProperty(srckey)) {
        parentObject = yhioeLiveData.yhioeAcctByUsr[srckey];
    } else {
        yhioeLiveData.yhioeAcctByUsr[srckey] = {};
        yhioeLiveData.yhioeAcctByUsr[srckey].yhioeAcctBySite = {};
        yhioeLiveData.yhioeAcctByUsr[srckey].yhioeAcctByTag = {};
        parentObject = yhioeLiveData.yhioeAcctByUsr[srckey];
    }
    /* per user accounting */
    yhioeDnsTokenAcctHelper(parentObject, row);
}

function yhioeAcctCounts(parentObject, usr) {
    var sites_list = [];
    var tags_list = [];
    for (const site in parentObject.yhioeAcctBySite) {
        sites_list.push({
            site: site,
            time_spent: parentObject.yhioeAcctBySite[site].time_spent
        });
    }
    for (const tag in parentObject.yhioeAcctByTag) {
        tags_list.push({
            tag: tag,
            time_spent: parentObject.yhioeAcctByTag[tag].time_spent
        });
    }
    sites_list.sort((a, b) =>
        (a.time_spent > b.time_spent) ? 1 : -1);
    tags_list.sort((a, b) =>
        (a.time_spent > b.time_spent) ? 1 : -1);
    var site_list_names = [];
    var site_list_values = [];
    var tag_list_names = [];
    var tag_list_values = [];
    for (let i = sites_list.length - 1; i >= 0; i--) {
        let sorted_site = sites_list[i];
        site_list_names.push(sorted_site.site);
        site_list_values.push(sorted_site.time_spent);
    }
    for (let i = tags_list.length - 1; i >= 0; i--) {
        let sorted_tag = tags_list[i];
        tag_list_names.push(sorted_tag.tag);
        tag_list_values.push(sorted_tag.time_spent);
    }
    return {
        acct: {
            bySite: {"sites": site_list_names, "time_spent": site_list_values},
            byTag: {"tags": tag_list_names, "time_spent": tag_list_values}
        }
    };
}

function yhioeRunAcctStats() {
    yhioeLiveData.yhAcctStats.byUser = {};
    for (const usr in yhioeLiveData.yhioeAcctByUsr) {
        let usrAcct = yhioeAcctCounts(yhioeLiveData, usr);
        yhioeLiveData.yhAcctStats.byUser[usr] = usrAcct;
    }
    yhioeLiveData.yhAcctStats.global =
        yhioeAcctCounts(yhioeLiveData);

    /*
      After this call the foll should be set:
      yhioeLiveData.yhAcctStats.byUser[usr].acct.bySite
      yhioeLiveData.yhAcctStats.byUser[usr].acct.byTag
      yhioeLiveData.yhAcctStats.global.acct.bySite
      yhioeLiveData.yhAcctStats.global.acct.byTag
     */

}

const YHIOE_COUNTS_LIMIT = 65536;

function yhioeGetCountsPlotData(countObject, countObjectName) {
    var all_ts = [];
    var all_cts = [];
    for (let ts in countObject.ts_counts) {
        let tscts = countObject.ts_counts[ts].counts;
        let count = Math.max(...tscts);
        all_ts.push(countObject.ts_counts[ts].time_hr_min);
        //all_ts.push(ts)
        all_cts.push(count);
    }
    return {srcname: countObjectName, ts: all_ts, count: all_cts}
}

function yhioeGetUserAndGlobalCounts() {
    var user_ct = [];
    for (let usr in yhioeLiveData.yhioeConnCt.byUser) {
        let cts = yhioeGetCountsPlotData(
            yhioeLiveData.yhioeConnCt.byUser[usr],
            yhioeLiveData.yhioeConnCt.byUser[usr].srcname);
        user_ct.push(cts);
    }
    let gcts =
        yhioeGetCountsPlotData(yhioeLiveData.yhioeConnCt.global,
            'global');
    return {userCounts: user_ct, globalCounts: gcts}
}

function yhioeTsToStr(ts) {
    let dt = new Date(ts * 1000);
    return dt.getHours() + ':' + dt.getMinutes() + ':' +  dt.getSeconds();
}

function yhioeCountFixup(countObject, row, count) {
    countObject.count = count;
    countObject.cts = row.ts;
    if (countObject.ts_counts.hasOwnProperty(row.ts)) {
        countObject.ts_counts[row.ts].counts.push(count);
    } else {
        countObject.ts_counts[row.ts] =
            {
                time_hr_min: yhioeTsToStr(row.ts),
                counts: [count]
            };
        countObject.ts_count += 1;
    }

    if (countObject.ts_count > YHIOE_COUNTS_LIMIT) {
        let truncateCt = countObject.ts_count - YHIOE_COUNTS_LIMIT;
        let i = 0;
        for (let ts in countObject.ts_counts) {
            if (i > truncateCt - 1) {
                break;
            }
            delete countObject.ts_counts[ts];
            countObject.ts_count -= 1;
        }
    }
}

function yhioeProcessDeviceSnapshot(snapshot) {
    let snap = getObjectIfValidJson(snapshot);
    let dvc_snap = snap[0];
    if (!yhioeLiveData.devices.hasOwnProperty(dvc_snap.device)) {
        yhioeLogMsg('device ' +
          dvc_snap.device + ' not found in ' +
          snapshot);
        return;
    }
    // yhioeLogMsg('processing snapshot ' + JSON.stringify(dvc_snap));
    var out = {
        device: null,
        platform: {},
        yh_memory: {},
        yh_top: [],
        yh_df: [],
        yh_cpu: 0,
        yh_memory_used: 0
    };
    yhioeLogMsg('device_id ' + dvc_snap.device +
      ' snapshot len ' + dvc_snap.snapshot.length);
    for (var i = 0; i < dvc_snap.snapshot.length; i++) {
        out.device = dvc_snap.device;
        switch (dvc_snap.snapshot[i].table) {
        case 'yh_cpu':
            out.yh_cpu = parseFloat(dvc_snap.snapshot[i].cpu);
            break;
        case 'yh_meminfo':
            out.yh_memory = dvc_snap.snapshot[i];
            let mt = out.yh_memory['MemTotal'].split(' ');
            let mf = out.yh_memory['MemAvailable'].split(' ');
            let t = parseInt(mt[0]),
              f = parseInt(mf[0]);
            let mtk = mt[1];
            out.yh_memory_used = Math.floor((100*(t-f)/t));
            break;
        case 'yh_top':
            out.yh_top.push(dvc_snap.snapshot[i]);
            break;
        case 'yh_df':
            let df = dvc_snap.snapshot[i];
            if (df['Mounted'] === '/' ||
              df['Filesystem'].indexOf('/dev/sd') >= 0 ||
              df['Filesystem'].indexOf('/dev/mmc') >= 0) {
                out.yh_df.push(df);
            }
            break;
        case 'platform':
            out.platform = dvc_snap.snapshot[i];
            break;
        default:
            break;
        }
    }
    yhioeLiveData.devices[dvc_snap.device].health = out;
    for (var j = 0; j < yhioeLiveData.device_health.length; j++) {
        if (yhioeLiveData.device_health[j].device === out.device) {
            break;
        }
    }
    if (j >= yhioeLiveData.device_health.length) {
         yhioeLiveData.device_health.push(out);
    } else {
        yhioeLiveData.device_health.splice(j, 1);
        yhioeLiveData.device_health.push(out);
    }
    yhioeLogMsg('device ' + dvc_snap.device + ' mem ' +
      yhioeLiveData.devices[dvc_snap.device].health.yh_memory_used +
      ' cpu ' + yhioeLiveData.devices[dvc_snap.device].health.yh_cpu);
}

function yhioeGetDeviceSnapshot(device) {
    authGet(yhioeLiveData.connection.host,
      yhioeLiveData.connection.port,
      '/snapshot',
      yhioeLiveData.credentials.cookie,
      yhioeProcessDeviceSnapshot, device);
}

function yhioeCheckDevices(row) {
    if (!row.hasOwnProperty('device')) {
        yhioeLogMsg('device not found in ' + JSON.stringify(row));
        return false;
    }
    var dvc;
    if (yhioeLiveData.devices.hasOwnProperty(row.device)) {
        dvc = yhioeLiveData.devices[row.device];
        // yhioeLogMsg('snapshot existing device ' + row.device);
    } else {
        dvc = yhioeLiveData.devices[row.device] = {snapshot: [], timer: null, health: {}};
        // yhioeLogMsg('snapshot adding device ' + row.device);
    }
    if (dvc.timer) {
        // yhioeLogMsg('timer exists ' + row.device);
        return true;
    }
    yhioeLogMsg('starting timer for ' + row.device);
    dvc.timer = setInterval(yhioeGetDeviceSnapshot, 30000, row.device);
    return true;
}

function yhioeRollingTableData(jsondata, cb, cbarg) {
    yhioeLiveData.jsonData += jsondata;
    let beg = yhioeLiveData.jsonData.indexOf('[');
    let end = yhioeLiveData.jsonData.indexOf(']');
    if (beg >= 0 && end > 0 && end > beg) {
        let fullObjJson = yhioeLiveData.jsonData.substring(beg, end + 1);
        let remaining = yhioeLiveData.jsonData.substring(end + 1);
        let obj = getObjectIfValidJson(fullObjJson);
        if (obj) {
            // console.log(fullObjJson);
            yhioeLiveData.listOfRecords.push(obj);
            yhioeLiveData.jsonData = remaining;
        } else {
            // console.log("bad data");
            // console.log(fullObjJson);
            return;
        }
    } else {
        // console.log("incomplate");
        // console.log(yhioeLiveData.jsonData);
        return;
    }
    let rows = yhioeLiveData.listOfRecords.pop();
    var tot_time = 0;

    // var tot = 0;
    // var st = '';
    // for (const obj in yhioeLiveData.yhioeConntrackObj) {
    //     st = st + obj + ' ';
    //     tot++;
    // }

    for (var i = 0; i < rows.length; i++) {
        let row = rows[i];
        if (i == 0) {
            yhioeCheckDevices(row);
        }
        if (row.hasOwnProperty('ctid')) {
            var conntrackKey = yhioeGetConntrackIndx(row);
            var srcKey = row.ip4sstr;
            var increment_by =
                yhioeLiveData.yhioeConntrackObj.hasOwnProperty(conntrackKey)? 0 : 1;
            switch (row.op) {
                case 'insert':
                    yhioeLiveData.yhioeConntrackObj[conntrackKey] = row;
                    if (!yhioeLiveData.yhioeConnCt.byUser.hasOwnProperty(srcKey)) {
                        yhioeLiveData.yhioeConnCt.byUser[srcKey] =
                            {
                                count: 1, cts: row.ts,
                                ts_counts: {
                                        [row.ts]: {
                                            time_hr_min: yhioeTsToStr(row.ts),
                                            counts: [1]
                                        }
                                    },
                                ts_count: 1,
                                srcname: row.srcname
                            };
                    } else {
                        yhioeLiveData.yhioeConnCt.byUser[srcKey].count += increment_by;
                        yhioeCountFixup(yhioeLiveData.yhioeConnCt.byUser[srcKey], row,
                            yhioeLiveData.yhioeConnCt.byUser[srcKey].count);
                    }
                     if (!yhioeLiveData.yhioeConnCt.global.hasOwnProperty('count')) {
                         yhioeLiveData.yhioeConnCt.global =
                             {
                                 count: 1, cts: row.ts,
                                 ts_counts: {
                                     [row.ts]: {
                                         time_hr_min: yhioeTsToStr(row.ts),
                                         counts: [1]
                                     }
                                 },
                                 ts_count: 1,
                             };
                     } else {
                         yhioeLiveData.yhioeConnCt.global.count += increment_by;
                         yhioeCountFixup(yhioeLiveData.yhioeConnCt.global, row,
                            yhioeLiveData.yhioeConnCt.global.count);
                     }
                    yhioeDnsTokenAcct(row);
                    break;
                case 'update':
                    yhioeDnsTokenAcct(row);
                    break;
                case 'delete':
                    /* we may be observing when connections are going down */
                    if (yhioeLiveData.yhioeConnCt.byUser.hasOwnProperty(srcKey)
                        && increment_by == 0) {
                        yhioeLiveData.yhioeConnCt.byUser[srcKey].count -= 1;
                        if (yhioeLiveData.yhioeConnCt.byUser[srcKey].count < 0) {
                            yhioeLiveData.yhioeConnCt.byUser[srcKey].count = 0;
                        }
                        yhioeCountFixup(yhioeLiveData.yhioeConnCt.byUser[srcKey], row,
                            yhioeLiveData.yhioeConnCt.byUser[srcKey].count);
                    }
                    if (yhioeLiveData.yhioeConnCt.global.hasOwnProperty('count') &&
                        increment_by == 0) {
                        yhioeLiveData.yhioeConnCt.global.count -= 1;
                        if (yhioeLiveData.yhioeConnCt.global.count < 0) {
                            yhioeLiveData.yhioeConnCt.global.count = 0;
                        }
                        yhioeCountFixup(yhioeLiveData.yhioeConnCt.global, row,
                            yhioeLiveData.yhioeConnCt.global.count);
                    }
                    if (increment_by == 0) {
                        delete yhioeLiveData.yhioeConntrackObj[conntrackKey];
                    } else {
                        // let msg = yhioeAppLogMsg(YHIOE_ERROR, 'key ' +
                        //     conntrackKey + ' not found');
                        // yhioeLiveData.yhioeAppLog.push(msg);
                    }
                    break;
            }
            // console.log(JSON.stringify(yhioeLiveData.yhioeConntrackObj,
            //     null, 2));
            if (cb) {
                cb({key: conntrackKey, row: row, arg: cbarg});
            }
        }
    }
}

function yhioeGetNetifs() {
    let ifinfos = os.networkInterfaces();
    var xformed = {};
    for (const [ifname, ifinfo] of Object.entries(ifinfos)) {
        if (ifname === "lo") {
            continue;
        }
        for (var i = 0; i < ifinfo.length; i++) {
            let ifi = ifinfo[i];
            xformed[ifname] = ifi.mac;
            break;
        }
    }
    return xformed;
}

function secStrDataOp(data, op, pathIfAny, tagPathIfAny) {
    var secData = null;
    const cwd = process.cwd();

    const plat = JSON.stringify(
        {
            interfaces: yhioeGetNetifs(),
            arch: os.arch(),
            cpu: os.cpus()[0].model,
            static: "k8hEPBDGx8DlWb3zWb0ZP4Ys6u4uVwbY7uJNz3TxySA="
        });
    const dgst = crypto.createHash('sha256');
    dgst.update(plat);
    var dgst64 = dgst.digest('base64');
    const kiv = crypto.pbkdf2Sync(dgst64,
        'OScUD/Sb7m5N4iTrYmteLIOmtziXqunwmg/gufJ+VFI=',
        10000, 64, 'sha512');
    const k = kiv.slice(0, 32);
    const iv = kiv.slice(32, 64);
    // console.log(op);
    // console.log(dgst64);
    // console.log(k.toString('base64'));
    // console.log(iv.toString('base64'));
    yhioeLogMsg('op ' + op + ' dgst64 ' + dgst64);
    var cip = (op === 'enc') ?
        crypto.createCipheriv('aes-256-gcm', k, iv):
        crypto.createDecipheriv('aes-256-gcm', k, iv);
    if (op == 'enc') {
        let encrypted = cip.update(data);
        encrypted = Buffer.concat([encrypted, cip.final()]);
        secData = cip.getAuthTag().toString('hex');
        try {
            fs.writeFileSync(yhioeLiveData.secDataPath,
              encrypted.toString('base64'));
            fs.writeFileSync(yhioeLiveData.secDataTagPath, secData);
        } catch (err) {
            return null;
        }
    } else if (op == 'dec' || op == 'del') {
        var buff = null;
        try {
            let b64data = fs.readFileSync(yhioeLiveData.secDataPath).toString();
            let tagData = data? data : fs.readFileSync(yhioeLiveData.secDataTagPath).toString();
            buff = Buffer.from(b64data, 'base64');
            cip.setAuthTag(Buffer.from(tagData, 'hex'));
            let decrypted = cip.update(buff);
            secData = Buffer.concat([decrypted, cip.final()]).toString();
        } catch (err) {
            return null;
        }
    }
    if (op === 'del') {
        yhioeLogMsg('deleting ' + yhioeLiveData.secDataPath +
        yhioeLiveData.secDataTagPath);
        fs.unlinkSync(yhioeLiveData.secDataPath);
        fs.unlinkSync(yhioeLiveData.secDataTagPath);
        yhioeLogMsg('secdata cleaned up successfully');
    }
    return secData;
}

function yhioeCheckSecData() {
    if (fs.existsSync(yhioeLiveData.secDataTagPath) &&
        fs.existsSync(yhioeLiveData.secDataPath)) {
        return true;
    }
    return false;
}

function yhioeModuleSM(text, txtbox, cb, cbarg) {
    if (!textbox) textbox = txtbox; // fix ifs with curlies for sanity
    let secdataNotAvailable = !yhioeCheckSecData();
    yhioeLogMsg('secdataNotAvailable ' + secdataNotAvailable + ' ' +
      yhioeLiveData.secDataTagPath + ' ' + yhioeLiveData.secDataPath);
    switch (yhioeLiveData.state) {
        case  YH_STATE_INITIAL:
            yhioeLogMsg('YH_STATE_INITIAL');
            if (secdataNotAvailable && text && text.length) {
                yhioeLiveData.credentials.user = text;
                if (textbox) textbox.setValue('Enter password:');
                yhioeLiveData.state = YH_STATE_USERNAME_ENTERED;
                if (textbox) textbox.censor = true;
            }
            break;
        case YH_STATE_USERNAME_ENTERED:
            yhioeLogMsg('YH_STATE_USERNAME_ENTERED');
            if (secdataNotAvailable && text && text.length) {
                yhioeLiveData.credentials.password = text;
                if (textbox) textbox.censor = false;
                yhioeLiveData.state = YH_STATE_PASSWORD_ENTERED;
                if (textbox) textbox.setValue('Enter email:');
            }
            break;
        case YH_STATE_PASSWORD_ENTERED:
            yhioeLogMsg('YH_STATE_PASSWORD_ENTERED');
            if (secdataNotAvailable && text && text.length) {
                yhioeLiveData.credentials.email = text;
                yhioeLiveData.state = YH_STATE_EMAIL_ENTERED;
                if (textbox) textbox.setValue('Enter endpoint/url:');
                yhioeLiveData.state = YH_STATE_ENDPOINT_ENTERED;
            }
            break;
        case YH_STATE_ENDPOINT_ENTERED:
            yhioeLogMsg('YH_STATE_ENDPOINT_ENTERED');
            if (secdataNotAvailable && text && text.length) {
                yhioeLiveData.connection.url = text;
                try {
                    const url = new URL(text);
                    yhioeLiveData.connection.host =
                        url.host.split(':')[0];
                    yhioeLiveData.connection.port = url.port;
                    yhioeLiveData.connection.endpoint = url.pathname;
                    if (yhioeLiveData.connection.endpoint === '/') {
                        yhioeLiveData.connection.endpoint = '/n/g';
                    }
                    yhioeLiveData.state = YH_STATE_EMAIL_ENTERED;
                    let msg = 'Host:' +
                        yhioeLiveData.connection.host +
                        ":" + yhioeLiveData.connection.port +
                        ' '  + yhioeLiveData.connection.endpoint +
                        ' Connecting...';
                    if (textbox) textbox.setValue(msg);
                    yhioeLogMsg(msg);
                    yhioeLiveData.state = YH_STATE_ENDPOINT_ENTERED;
                    authenticateAndFetchWithParams(
                        yhioeLiveData.connection.host,
                        yhioeLiveData.connection.port,
                        yhioeLiveData.connection.endpoint,
                        yhioeLiveData.credentials, null,
                        cb, cbarg);
                } catch(err) {
                    break;
                }
            }
            break;
        case YH_STATE_LOGGED_IN:
            yhioeLogMsg('YH_STATE_LOGGED_IN');
            if (text && text.length) {
                yhioeLogMsg(text);
                authpost(yhioeLiveData.connection.host,
                  yhioeLiveData.connection.port,
                  '/c',
                  yhioeLiveData.credentials.cookie,
                  {query: text}, null, null);
            }
            break;
        default:
            break;
    }
}

const authGet = (host, port, path, cookie, cb, cbarg) => {
    var options = {
        hostname: host,
        port: port,
        path: path,
        method: 'GET',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'UNpkl/1',
            'Cookie': cookie,
            'Connection': 'Keep-Alive'
        }
    };
    var req = https.request(options, (res) => {
        // console.log('statusCode:', res.statusCode);
        // console.log('headers:', res.headers);
        var data = '';
        res.on('data', (d) => {
            var x = d.toString();
            switch(path) {
                /*
                 * TODO:for love of whatever.. reverse this
                 * so that all of this is uniformly wrapped
                 * in cb(cbarg) and rid this ugliness
                 */
                case '/n/g':
                    yhioeRollingTableData(x, cb, cbarg);
                    break;
                default:
                    cb(x, cbarg);
            }
        })
    });
    req.on('error', (e) => {
        //console.error(e);
    });
    req.end();
};

const saveLoadSecData = (op) => {
    if (op === 'load') {
        let cwd = process.cwd();
        var filename = yhioeLiveData.secDataPath || path.join(cwd, ".secData");
        var secDataTag = yhioeLiveData.secDataTagPath ||  path.join(cwd, ".secDataTag");
        if (!(fs.existsSync(filename) && fs.existsSync(secDataTag))) {
            yhioeLogMsg('file(s) not found ' +
              yhioeLiveData.secDataPath + ' ' +
              yhioeLiveData.secDataTagPath);
            return null;
        }
        let secdataJson = secStrDataOp(null, 'dec');
        if (!secdataJson) {
            yhioeLogMsg('failed to dec/load ' +
            yhioeLiveData.secDataPath + ' ' +
            yhioeLiveData.secDataTagPath);
            return null;
        }
        try {
            let secdata = JSON.parse(secdataJson);
            yhioeLiveData.connection.host = secdata.host;
            yhioeLiveData.connection.port = secdata.port;
            yhioeLiveData.connection.endpoint = secdata.endpoint;
            yhioeLiveData.connection.url =
                'https://' +
                yhioeLiveData.connection.host + ':' +
                yhioeLiveData.connection.port + '/' +
                yhioeLiveData.connection.endpoint;
            yhioeLiveData.credentials.user = secdata.user;
            yhioeLiveData.credentials.password = secdata.password;
            yhioeLiveData.credentials.email = secdata.email;
            return secdata;
        } catch (e) {
            yhioeLogMsg('corrupted secData');
            return null;
        }
    } 
    if (op === 'save') {
        let secdata = {...yhioeLiveData.credentials, ...yhioeLiveData.connection};
        return secStrDataOp(JSON.stringify(secdata), 'enc');
    }
    if (op === 'del') {
        return secStrDataOp(null, 'del');
    }
    yhioeLogMsg('unknown op ' + op);
    return null;
}

const authFetch = (host, port, path, credentials, data, cb, cbarg) => {
    var cookie = credentials.cookie;
    delete credentials.cookie;
    var postData = querystring.stringify({...credentials});
    var options = {
        hostname: host,
        port: port,
        path: '/',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length,
            'User-Agent': 'UNpkl/1',
            'Cookie': cookie,
            'Connection': 'Keep-Alive'
        }
    };
    /* At first, authenticate */
    var req = https.request(options, (res) => {
        // console.log('statusCode:', res.statusCode);
        // console.log('headers:', res.headers);
        if (res.statusCode >= 200 && res.statusCode < 400) {
            res.on('data', (d) => {
                /* If we have dem cookies and things went well
                 * at auth getCookies and send get or post
                 * Cloud sends us a modified cookie
                 * to indicate owner.
                 */
                var newcookie = cookie;
                if (newcookie.indexOf('session=') >= 0) {
                    newcookie = getCookies(res);
                }
                /*
                    save for future use
                 */
                yhioeAppLog(YHIOE_INFO, 'auth ok');
                yhioeLogMsg('auth ok');
                if (textbox) textbox.setValue(
                    'connected to ' + host + ':'+ port);
                yhioeLiveData.state = YH_STATE_LOGGED_IN;
                if (!yhioeCheckSecData()) {
                    saveLoadSecData('save');
                }
                yhioeLiveData.credentials.cookie = newcookie;
                yhioeModuleSM();
                // console.log("cookie: " + newcookie);
                // process.stdout.write(d);
                // process.stdout.write('\n');
                if (data) {
                    return authpost(host, port, path, newcookie, data, cb, cbarg);
                } else {
                    return authGet(host, port, path, newcookie, cb, cbarg);
                }
            });
        } else {
            res.on('data', (d) => {
                yhioeAppLog(YHIOE_ERROR, 'auth failed');
                saveLoadSecData('del');
            });
        }
    });
    req.write(postData);
    req.on('error', (e) => {
        // console.error(e);
    });
    req.end();
};

const getCookies = (res) => {
    var cook = [];
    for (var i = 0; i < res.headers['set-cookie'].length; i++) {
        var cookie =  res.headers['set-cookie'][i];
        var cookie_str = cookie.slice(0, cookie.indexOf(';'));
        cook.push(cookie_str);
    }
    return cook.join('; ');
};

const authenticateAndFetchWithParams = (host, port, path, credentials, postdata,
                              cb, cbarg) => {
    var options = {
        hostname: host,
        port: port,
        path: '/',
        method: 'GET',
        headers: {'User-Agent': 'UNpkl/1'}
    };
    yhioeAppLog(YHIOE_INFO, 'connecting to' + host + ':' + port);
    var req = https.request(options, (res) => {
        // console.log('statusCode:', res.statusCode);
        // console.log('headers:', res.headers);
        if (res.headers['set-cookie'].length) {
            credentials = {
                ...credentials,
                cookie: getCookies(res)
            };
            return authFetch(host, port, path,
                credentials, postdata, cb, cbarg);
        }
    });

    req.on('error', (e) => {
        //console.error(e);
        if (cb) {
            cb(null, e.toString());
        }
    });
    req.end();
};

const authenticateAndFetch = (path, postData, cb, cbarg) => {
    let loaded = saveLoadSecData('load');
    // yhioeLogMsg('loaded ' + JSON.stringify(loaded));
    if (loaded) {
        yhioeModuleSM();
        yhioeLogMsg('authenticating using saved creds');
        authenticateAndFetchWithParams(yhioeLiveData.connection.host,
            yhioeLiveData.connection.port,
            path? path: yhioeLiveData.connection.endpoint,
            yhioeLiveData.credentials,
            postData, cb, cbarg);
    } else {
        yhioeLogMsg('saved creds invalid cleaning up');
        saveLoadSecData('del');
        yhioeLiveData.state = YH_STATE_INITIAL;
    }
}

exports.yhioeSetScreenRef = yhioeSetScreenRef;
exports.authenticateAndFetchWithParams = authenticateAndFetchWithParams;
exports.yhioeModuleSM = yhioeModuleSM;
exports.authenticateAndFetch = authenticateAndFetch;
exports.yhioeRunAcctStats = yhioeRunAcctStats;
exports.yhioeGetUserAndGlobalCounts = yhioeGetUserAndGlobalCounts;
exports.yhioeAppLog = yhioeAppLog;
exports.yhioeLogMsg = yhioeLogMsg;
exports.yhioeSetTextboxRef = yhioeSetTextboxRef;
exports.yhioeLiveData = yhioeLiveData;

// Uncomment to test
// yhioeClientTest();
