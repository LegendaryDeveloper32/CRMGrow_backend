$(function () {
  let total = 0;
  const total_pages = document.querySelector('#total').value;
  setInterval(() => {
    reportTime();
  }, 1000);

  const image = document.querySelector('#material').value;
  const user = document.querySelector('#user').value;
  const contact = document.querySelector('#contact').value;
  const activity = document.querySelector('#activity').value;
  var socket;
  var report = {
    image,
    user,
    contact,
    activity,
    duration: 0,
  };
  var registered_flag = false;
  var reported = false;
  if (contact && activity) {
    socket = io.connect('https://app.crmgrow.com');
    // socket = io.connect('http://localhost:3000');
  }

  function reportTime() {
    if (total !== 0 && socket) {
      if (total * 1000 < total_pages * 10000) {
        if (!registered_flag) {
          registered_flag = true;
          socket.emit('init_image', report);
        } else {
          socket.emit('update_image', total * 1000);
        }
      } else {
        if (!reported) {
          socket.emit('update_image', duration * 1000);
          socket.emit('close');
          reported = true;
        }
      }
    }
    total++;
  }

  Galleria.loadTheme('./theme/plugins/galleria/galleria.classic.min.js');

  // Initialize Galleria
  Galleria.run('#galleria');

  $("#galleria").on("click", ".galleria-stage .galleria-image img", function(e) {
    let currentIndex = $("#galleria .galleria-current").html();
    $("#gallery-container a:nth-child(" + currentIndex + ") img").click();
  });
});