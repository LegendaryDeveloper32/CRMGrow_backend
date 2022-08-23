// PDF Flipbook Loading
let duration = 0;

let pdfObj;
let totalPages = 0;
let pageInited = false;

let leadOpened = false;

var socket;
var registered_flag = false;
var reported = false;

setInterval(() => {
  if(FLIPBOOK.lightboxOpened && pageInited && !leadOpened) {
    duration++;
    reportTime();
  }
}, 1000);

function reportTime() {
  if (duration !== 0 && socket) {
    if (duration * 1000 < totalPages * 10000) {
      if (!registered_flag) {
        const pdf = document.querySelector('#material').value;
        const user = document.querySelector('#user').value;
        const contact = document.querySelector('#contact').value;
        const activity = document.querySelector('#activity').value;
        var report = {
          pdf,
          user,
          contact,
          activity,
          duration: 0
        }
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


  let delayTime = parseInt($('#capture-delay').val());
  let showable = $('#capture-dialog').val();
  if (showable == 'true') {
    if (delayTime) {
      setTimeout(() => {
        if(!captured) {
          $('#leadModal').modal({backdrop: 'static', keyboard: false});
            // Protect the Body Form
          $('body').addClass('is_protected');
          lead_opened = true;
        }
      }, delayTime * 60000)
    } else {
      $('#leadModal').modal({backdrop: 'static', keyboard: false});
      // Protect the Body Form
      $('body').addClass('is_protected');
      lead_opened = true;
    }
  }

  $('#info-form').submit((e) => {
    e.preventDefault();
    var formData = $('#info-form').serializeArray();
    var data = {};
    formData.forEach((e) => {
      data[e['name']] = e['value'];
    });
    $('#info-form .btn').addClass('loading');
    $('#info-form .btn').text('Please wait...');
    $.ajax({
      type: 'POST',
      url: 'api/contact/lead',
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(data),
      success: function (data) {
        const response = data.data;
        if (response) {
          if(document.querySelector(".intro_video")) {
            document.querySelector(".intro_video").muted = true
            document.querySelector(".intro_video").pause();
          }
          $('#contact').val(response.contact);
          $('#activity').val(response.activity);
          var siteAddr = location.protocol + '//' + location.hostname;
          // var siteAddr = "http://localhost:3000";
          socket = io.connect(siteAddr);
          if(updateInterested) {
            updateInterested();
          }
        }
        $('#info-form .btn').removeClass('loading');
        $('#info-form .btn').text('Submit');
        $('body').removeClass('is_protected');
        $('#leadModal').modal('hide');
        lead_opened = false;
        captured = true;
      },
      error: function (data) {
        $('#info-form .btn').removeClass('loading');
        $('#info-form .btn').text('Submit');
        if (data.status == 400) {
          const response = data.responseJSON;
          if (response && response['error']) {
            alert(response['error']);
          } else {
            alert('Internal Server Error');
          }
        } else {
          alert('Internal Server Error');
        }
        lead_opened = false;
      },
    });
  });

  $(".quick-video-wrapper .volume-control").click(e => {
    let volumnStatus = document.querySelector(".intro_video").muted;
    document.querySelector(".intro_video").muted = !volumnStatus
    if(volumnStatus) {
      $(".quick-video-wrapper .volume-control img").attr("src", "./theme/icons/mute.png")
    }
    else {
      $(".quick-video-wrapper .volume-control img").attr("src", "./theme/icons/unmute.png")
    }
  })
})

