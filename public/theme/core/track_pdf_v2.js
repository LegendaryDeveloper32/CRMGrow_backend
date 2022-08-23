// PDF Flipbook Loading
let duration = 0;

let pdfObj;
let totalPages = 0;
let pageInited = false;

var socket;
var registered_flag = false;
var reported = false;
var report;

function reportTime() {
  if (duration !== 0 && socket) {
    if (duration * 1000 < totalPages * 10000) {
      if (!registered_flag && report) {
        registered_flag = true;
        socket.emit('init_pdf', report);
      } else {
        socket.emit('update_pdf', duration * 1000);
      }
    } else {
      if (!reported) {
        socket.emit('update_pdf', totalPages * 10000);
        socket.emit('close');
        reported = true;
      }
    }
  }
}

setInterval(() => {
  if(FLIPBOOK.lightboxOpened && pageInited) {
    duration++;
    reportTime();
  }
}, 1000);


$(document).ready(function () {
  pdfObj = $("#pdf-container").flipBook({
    pdfUrl: $("#pdfpath").val(),
    lightBox:true,
    lightboxBackground:'rgba(220,225,229,1)',
    onbookcreated:function(){
        totalPages = pdfObj.options.pages.length
        pageInited = true;
    },
    onfullscreenenter:function(){
        console.log("onfullscreenenter()")
    },
    onfullscreenexit:function(){
        console.log("onfullscreenexit()")
    },
  });

  const pdf = document.querySelector('#material').value;
  const user = document.querySelector('#user').value;
  const contact = document.querySelector('#contact').value;
  const activity = document.querySelector('#activity').value;

  report = {
    pdf,
    user,
    contact,
    activity,
    duration: 0,
  };
  if (contact && activity) {
    socket = io.connect('https://app.crmgrow.com');
    // socket = io.connect('http://localhost:3000')
  }
})