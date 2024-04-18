const { response } = require('express');
const express = require('express')
const app = express()
const port = 3000
require('dotenv').config();

// pipe fix 6

const units = ['bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
   
function getByteUnit(x){

  let l = 0, n = parseInt(x, 10) || 0;

  while(n >= 1024 && ++l){
      n = n/1024;
  }
  
  return(units[l]);
}

function niceBytes(x){

  let l = 0, n = parseInt(x, 10) || 0;

  while(n >= 1024 && ++l){
      n = n/1024;
  }
  
  return(n.toFixed(n < 10 && l > 0 ? 1 : 0));
}

if(process.env.PROMETHEUS_API_USER && process.env.PROMETHEUS_API_PASSWORD){
    var basicauth=Buffer.from("${process.env.PROMETHEUS_API_USER}:${process.env.PROMETHEUS_API_PASSWORD}").toString('base64')
app.use(function(req, res, next) {
    res.header("Authorization", "Basic $basicauth");
    next();
  });
}

app.get('/health', (req, res) => {
    return res.json({ success: true });
})

app.get('/metrics/ns', (req, res) => {
    fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NS))
    .then((response) => response.json())
    .then((body) => {
        console.log(body)
        if (body.status) {
            myresult={data:[]}
            myresult.key = "NS"
            body.data.result.forEach((item,i)=>{
                myresult.data[i]=item.metric.namespace
            })
            res.json(myresult);
        }
        else {
            return res.json({ error: body.error });
        }
    });    
})

app.get('/metrics/pod', (req, res) => {

    const queries = [
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_POD_STATUS)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_POD_CPU_USAGE)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_POD_MEMORY_USAGE)),
    ];
    const descriptions = [
        "POD_STATUS",
        "CPU_USAGE",
        "MEMORY_USAGE"
        ];

    // Tüm sorguların tamamlanmasını bekleyin
    Promise.all(queries)
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(results => {
            // Tüm sonuçları birleştirir
            const combinedResults = results.reduce((acc, result ,i) => {
                if (result.status) {
                    result.key = descriptions[i];
                    acc.push(result);
                }
                return acc;
            }, []);

            var result = combinedResults[0].data.result.map((pod)=>{
                var mypod={usage:{}}
                mypod.namespace = pod.metric.namespace;
                mypod.phase = pod.metric.phase;
                mypod.name = pod.metric.pod;
                mypod.usage.unit = {}
                const cpu =combinedResults[1].data.result.find(item => item.metric.namespace==mypod.namespace && item.metric.pod==mypod.name);
                if(cpu)
                    {
                        mypod.usage.cpu = Math.ceil(cpu.value[1] * 100) / 100
                        mypod.usage.unit.cpu = "Core"
                    }
                const memory = combinedResults[2].data.result.find(item => item.metric.namespace==mypod.namespace && item.metric.pod==mypod.name);
                if(memory){
                    mypod.usage.memory = parseFloat(niceBytes(memory.value[1]));
                    mypod.usage.unit.memory = getByteUnit(memory.value[1])
                }
                return mypod;
            });
            var myresult={}
            myresult.status = "success"
            myresult.key = "POD_STATUS"
            myresult.data=result

            res.json(myresult);
        })
        .catch(error => {
            // Hataları ele alın
            console.error('Error fetching Prometheus data:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        });

    
})

app.get('/metrics/pvc', (req, res) => {

    const queries = [
        //----- total ----
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_PVC_TOTAL)),
        //----- usage ----
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_PVC_USAGE)),
    ];
    const descriptions = [
        "PVC_USAGE",
        "PVC_TOTAL"
        ];

    // Tüm sorguların tamamlanmasını bekleyin
    Promise.all(queries)
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(results => {
            // Tüm sonuçları birleştirir
            const combinedResults = results.reduce((acc, result ,i) => {
                if (result.status) {
                    result.key = descriptions[i];
                    acc.push(result);
                }
                return acc;
            }, []);


            var result = combinedResults[0].data.result.map((pvc)=>{
                var mypvc={usage:{}, total:{}}
                mypvc.namespace = pvc.metric.namespace;
                mypvc.persistentvolumeclaim = pvc.metric.persistentvolumeclaim;

                mypvc.total.pvc = Math.round(parseFloat(niceBytes(pvc.value[1])));
                mypvc.total.unit = {pvc: getByteUnit(pvc.value[1])}
                mypvc.usage.pvc = Math.round(parseFloat(combinedResults[1].data.result.find(item => item.metric.namespace==mypvc.namespace && item.metric.persistentvolumeclaim==mypvc.persistentvolumeclaim).value[1]));
                mypvc.usage.unit = {pvc: "%"}
                return mypvc;
            });
            var myresult={}
            myresult.status = "success"
            myresult.key = "PVC_STATUS"
            myresult.data=result

            res.json(myresult);
        })
        .catch(error => {
            // Hataları ele alın
            console.error('Error fetching Prometheus data:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        });

    
})



app.get('/metrics/alerts', (req, res) => {

    return fetch(process.env.PROMETHEUS_API_URL+'/alerts')
    .then((response) => response.json())
    .then((body) => {
        console.log(body)
        if (body.status) {
            body.key = "ALERTS"
            return res.json(body)
        }
        else {
            return res.json({ error: body.error });
        }
    });    
})

app.get('/metrics/node', (req, res) => {

    const queries = [
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_UNAME)),
        //----- usage ----
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_MEMORY_USAGE)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_DISK_USAGE)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_CPU_USAGE)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_POD_USAGE)),
        //----- total ----
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_MEMORY_TOTAL)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_DISK_TOTAL)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_CPU_TOTAL)),
        fetch(process.env.PROMETHEUS_API_URL + '/query?query=' + encodeURIComponent(process.env.PQL_NODE_POD_TOTAL)),
    ];
    const descriptions = [
        "UNAME",
        "MEMORY_USAGE",
        "DISK_USAGE",
        "CPU_USAGE",
        "POD_USAGE",
        "MEMORY_TOTAL",
        "DISK_TOTAL",
        "CPU_TOTAL",
        "POD_TOTAL"
        ];

    // Tüm sorguların tamamlanmasını bekleyin
    Promise.all(queries)
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(results => {
            // Tüm sonuçları birleştirin
            const combinedResults = results.reduce((acc, result ,i) => {
                if (result.status) {
                    result.key = descriptions[i];
                    acc.push(result); // ya da istediğiniz bir şekilde sonuçları birleştirin
                }
                return acc;
            }, []);

            var summary={usage:{cpu:0,disk:0,memory:0, pod:0}, total:{cpu:0,disk:0,memory:0, pod:0}, severity:{cpu: false, memory: false, disk: false, pod: false}}
            var rawtotal={memory: 0, disk: 0};
            var result = combinedResults[0].data.result.map((node)=>{
                var mynode={usage:{}, total:{}}
                mynode.name = node.metric.nodename;
                mynode.instance = node.metric.instance;
                // --- usage ---
                mynode.usage.memory = Math.round(parseFloat(combinedResults[1].data.result.find(item => item.metric.instance==mynode.instance).value[1]));
                mynode.usage.disk = Math.round(parseFloat(combinedResults[2].data.result.find(item => item.metric.instance==mynode.instance).value[1]));
                mynode.usage.cpu = Math.round(parseFloat(combinedResults[3].data.result.find(item => item.metric.instance==mynode.instance).value[1]));
                mynode.usage.pod = Math.round(parseFloat(combinedResults[4].data.result.find(item => item.metric.node==mynode.name).value[1]));
                mynode.usage.unit = {cpu: "%", disk: "%", memory: "%", pod: "%"}
                // --- total ---
                var totalmemory = parseFloat(combinedResults[5].data.result.find(item => item.metric.node==mynode.name).value[1]);
                mynode.total.memory = Math.round(parseFloat(niceBytes(totalmemory)));
                var totaldisk = parseFloat(combinedResults[6].data.result.find(item => item.metric.node==mynode.name).value[1]);
                mynode.total.disk =  Math.round(parseFloat(niceBytes(totaldisk)));
                mynode.total.cpu = Math.round(parseFloat(combinedResults[7].data.result.find(item => item.metric.node==mynode.name).value[1]));
                mynode.total.pod = Math.round(parseFloat(combinedResults[8].data.result.find(item => item.metric.node==mynode.name).value[1]));
                mynode.total.unit = {cpu: "Core", disk: getByteUnit(totaldisk), memory: getByteUnit(totalmemory), pod: "Number"}

                summary.usage.cpu = summary.usage.cpu +  mynode.usage.cpu;
                summary.usage.disk = summary.usage.disk +  mynode.usage.disk;
                summary.usage.memory = summary.usage.memory +  mynode.usage.memory;
                summary.usage.pod = summary.usage.pod +  mynode.usage.pod;

                summary.total.cpu = summary.total.cpu + mynode.total.cpu;
                summary.total.disk = summary.total.disk + mynode.total.disk;
                summary.total.memory = summary.total.memory + mynode.total.memory;
                summary.total.pod = summary.total.pod + mynode.total.pod;
                
                rawtotal.disk = rawtotal.disk + totaldisk;
                rawtotal.memory = rawtotal.memory + totalmemory;

                if(mynode.usage.cpu > process.env.DEFAULT_THRESHOLD)
                    summary.severity.cpu = true;                
                if(mynode.usage.memory > process.env.DEFAULT_THRESHOLD)
                    summary.severity.memory = true;
                if(mynode.usage.disk > process.env.DEFAULT_THRESHOLD)
                    summary.severity.disk = true;                
                if(mynode.usage.pod > process.env.DEFAULT_THRESHOLD)
                    summary.severity.pod = true;
                return mynode;
            });
            var myresult={}
            myresult.status = "success"
            myresult.key = "NODE_STATUS"

            const nodeCount = result.length;
            summary.usage = {   cpu: Math.round(parseFloat(summary.usage.cpu/nodeCount)), 
                                disk: Math.round(parseFloat(summary.usage.disk/nodeCount)), 
                                memory: Math.round(parseFloat(summary.usage.memory/nodeCount)),
                                pod: Math.round(parseFloat(summary.usage.pod/nodeCount))
                            }
            summary.total.disk = Math.round(parseFloat(niceBytes(summary.total.disk)));
            summary.total.memory = Math.round(parseFloat(niceBytes(summary.total.memory)));
            summary.usage.unit = {cpu: "%", disk: "%", memory: "%", pod: "%"}
            summary.total.unit = {cpu: "Core", disk: getByteUnit(rawtotal.disk), memory: getByteUnit(rawtotal.memory), pod: "Number"}
            myresult.summary = summary;
            myresult.data=result

            res.json(myresult);
        })
        .catch(error => {
            // Hataları ele alın
            console.error('Error fetching Prometheus data:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        });

    
})

app.get('/metrics/metric4', (req, res) => {

    return res.send("OK");

    return fetch(process.env.PROMETHEUS_API_URL+'/query?query='+encodeURIComponent(process.env.PQL_METRIC4))
    .then((response) => response.json())
    .then((body) => {
        console.log(body)
        if (body.status) {
            return res.json(body)
        }
        else {
            return res.json({ error: body.error });
        }
    });    
})

app.get('/metrics/metric5', (req, res) => {

    return fetch(process.env.PROMETHEUS_API_URL+'/query?query='+encodeURIComponent(process.env.PQL_METRIC5))
    .then((response) => response.json())
    .then((body) => {
        console.log(body)
        if (body.status) {
            return res.json(body)
        }
        else {
            return res.json({ error: body.error });
        }
    });    
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})