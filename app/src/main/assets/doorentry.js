/* global ich, $, hostConfig, vex, attachMediaStream, IPCortex */

// loads API files from PABX defined in the config file
var scripts = ['/api/wrapper.whtm', '/cinclude/adapter.js', '/api/jssip/jssip.js']
for (var script in scripts) {
  $('<script>').attr('type', 'text/javascript').appendTo('body').attr('src', 'https://' + hostConfig.getHost() + scripts[script])
}

// Vex is the dialog library from HubSpot
vex.defaultOptions.className = 'vex-theme-flat-attack'
vex.defaultOptions.overlayClosesOnClick = false

var calling = false

// This function is an abstraction that allows a maths genius to implement dynamically
// determining the groups of letters.
function alphabetGroups (companies) {
  // these were determined by statistical analysis of the Companies House database
  var letterGroups = [
    ['a'], ['b'], ['c'], ['d', 'e', 'f'],
    ['g', 'h', 'i'], ['j', 'k', 'l'], ['m'], ['n', 'o'],
    ['p'], ['q', 'r'], ['s'], ['t'],
    ['u', 'v', 'w'], ['x', 'y', 'z']
  ]
  return letterGroups
}
var DoorEntry = (function () {
  var DE = {}
  DE.line // our line to use for any call

  DE.initialize = function () {
    var readyCount = 0 // Number of callbacks still needing to complete before ready
    var needAlphabet

    function iAmReady () {
      // Called when a callback declares it is finished. When all callbacks have
      // finished, execution continues.
      // Function should be called twice.
      readyCount++
      if (readyCount === 2) {
        // The application should be initialized at this point - with the companies listed
        // and synchronized with the PBX addressbook; and the line should be ready to call
        // the companies' extension.
        console.log('Ready')
        $(document.body).append($('<video>').attr('id', 'callstreamvideo').css('display', 'none').prop('autoplay', true))
        if (needAlphabet) {
          renderCompanies()
        } else {
          renderCompanies(DE.companies)
        }
      }
    }
    IPCortex.PBX.Auth.login(hostConfig.getUsername(), hostConfig.getPassword(), false, function (status) {
      console.log('Auth: ', ((status === true) ? 'succeeded' : 'failed'))
      IPCortex.PBX.startPoll(function () {
        // need to poll Addressbook and our available lines
        IPCortex.PBX.getAddressbook(function (addresses, deleted) {
          var companies = [] // temporary companies list before sorting
          var prefix = hostConfig.getPrefix()
          for (var i in addresses) {
            var address = addresses[i]
            // Filter the companies' allocated door entry users.
            if (address.get('name').substr(0, prefix.length) === prefix) {
              console.log('Got company: ' + address.get('name').substr(prefix.length))
              companies.push({
                name: address.get('name').substr(prefix.length),
                image: 'https://fenton.bpoffice.ipcortex.net/api/image.whtm/' + address.get('cid') + '/300',
                extension: address.get('extension'),
                companyid: address.get('cid')
              })
            }
          }
          // at this point companies contains an array of company objects with fields
          // name, image, extension, companyid (which is company door user ID)
          if (companies.length > 12) {
            // companies need sorting into alphabetical groups
            var groups = alphabetGroups(companies)
            DE.companies = {group: []}
            for (var k = 0; k < groups.length; k++) {
              // set letters attribute of DE company group to array of letters
              DE.companies.group.push({})
              DE.companies.group[k].letters = groups[k]
              DE.companies.group[k].companies = []
              if (companies.length > 0) {
                for (var j = 0; j < companies.length;) {
                  if (groups[k].indexOf(companies[j].name.substr(0, 1).toLowerCase()) !== -1) {
                    // add company to this group's company array
                    DE.companies.group[k].companies.push(companies.shift())
                  } else {
                    // go to next group
                    break
                  }
                }
              }
            }
            needAlphabet = true
          } else {
            // when there are less than 12 companies
            DE.companies = companies
            needAlphabet = false
          }
          iAmReady()
        })
        IPCortex.PBX.getLines(function (lines) {
          for (var line in lines) {
            if (DE.line) {
              return
            }
            // Filter the first webRTC-enabled line
            if (lines[line].get('webrtc')) {
              var ourLine = lines[line]
              // lineStatusChange is called everytime the line status changes (!)
              ourLine.hook(lineStatusChange)
              ourLine.enablertc()
              // Set this line as global line
              DE.line = ourLine
              iAmReady()
              break
            }
          }
        }, true)
      }, function (code, message) {
        // Error function for starting the Poll
        console.log('Error: ' + code + 'Message: ' + message)
      })
    })
  }
  function lineStatusChange (filter, hid, device) {
    var calls = device.get('calls')
    for (var call in calls) {
      // call ended
      if (calls[call].get('state') === 'dead') {
        document.querySelector('#callstreamvideo').pause()
        // included in case semantic ui is needed again but it was removed because it doesn't work very well
        // $('#callmodal').modal('hide')
        // $('.ui.dimmer.modals.page').removeClass('visible').removeClass('active').addClass('hidden')
      }
      var streams = calls[call].get('remoteStreams')
      // call started
      if (calls[call].get('state').search(/^(ring|up)/) !== -1 && streams.length) {
        var videotag = document.querySelector('#callstreamvideo')
        attachMediaStream(videotag, streams[0])
        // FIXME: change to vex dialog
        $('#loading').dimmer('hide')
        $(document.body).css('display', 'inline')
        $('.companygroup').each(function (index) {
          if (!$(this).visible(true)) {
            $('#' + $(this).data('lettergroupid')).css({backgroundColor: '#003263', color: '#FFFFFF'})
          }
        })
        if (calling) {
          vex.dialog.open(callDialogOptions)
          calling = false
        }
        // see above
        // $('#callmodal').modal('show')
      }
    }
  }
  function renderAlphabet () {
    var numberGroups = DE.companies.group.length
    // determine height depending on number of letter groups
    var letterGroupHeight = (100 / numberGroups) | 0
    for (var group in DE.companies.group) {
      if (DE.companies.group[group].companies.length > 0) {
        $('#alphabet > table > tbody').append(ich.tmpl_lettergroup({
          letters: DE.companies.group[group].letters.join('').toUpperCase()
        }).css('height', letterGroupHeight + 'vh'))
      } else {
        $('#alphabet > table > tbody').append(ich.tmpl_lettergroup({
          letters: DE.companies.group[group].letters.join('').toUpperCase()
        }).css('height', letterGroupHeight + 'vh').css('color', '#888888'))
      }
    }
    // have letter groups highlighted initially before recalculated upon scrolling
    setTimeout(function () {
      $('.companygroup').each(function (index) {
        if ($(this).visible(true)) {
          $('#' + $(this).data('lettergroupid')).css({backgroundColor: '#FFFFFF', color: '#003263'})
        }
      })
    }, 1500)
  }
  function renderCompanies (companies) {
    // If more than 12 companies then this function is called without arguments. The companies
    // are then rendered in alphabetical groups with an alphabetical scrollbar. Between 12 and 6
    // companies are rendered in cards without the alphabet and 6 or less cards are rendered as
    // full width items.
    if (companies && companies.length <= 6) {
      $('#companies-list').addClass('ui items')
      for (var p in companies) {
        $('#companies-list').append(ich.tmpl_companyitem(DE.companies[p]).css('background-color', 'white'))
      }
    } else if (companies) {
      $('#companies-list').addClass('ui three cards')
      for (var q in companies) {
        $('#companies-list').append(ich.tmpl_companycard(DE.companies[q]))
      }
    } else {
      $('#companies-list').css('width', '88vw')
      for (var group in DE.companies.group) {
        var renderedGroup = ich.tmpl_companygroup({
          letters: DE.companies.group[group].letters.join('').toUpperCase(),
          not_empty: DE.companies.group[group].companies.length > 0
        })
        for (var r in DE.companies.group[group].companies) {
          renderedGroup.append(ich.tmpl_companycard(
            DE.companies.group[group].companies[r]))
        }
        $('#companies-list').append(renderedGroup)
      }
      renderAlphabet()
    }
  }
  DE.call = function (name, extension) {
    if (!calling) {
      calling = true
      DE.line.dial(extension, function (success, message) {
        if (!success) {
          console.log(message)
        }
      })
      // see above
      // $('#callmodal .header').html('Calling ' + name)
      callDialogOptions.message = 'Calling ' + name
      // TODO: add better loading screen
      $(document.body).css('display', 'none')
      // $('#loading').dimmer('show')
    }
  }
  DE.endCall = function () {
    var calls = DE.line.get('calls')
    for (var call in calls) {
      if (calls[call].get('state').search(/^(ring|up)/) !== -1) {
        document.querySelector('#callstreamvideo').pause()
        calls[call].hangup()
      }
    }
  }
  return DE
})()

var callDialogOptions = {
  buttons: [
    $.extend({}, vex.dialog.buttons.YES, {
      text: 'End Call'
    })
  ],
  afterClose: DoorEntry.endCall
}

var onAPILoadReady = DoorEntry.initialize

// click handler for alphabet links
function alphabetScroll (element) {
  var targetPosition = $(element).offset().top + 5
  $('html, body').stop().animate({
    scrollTop: targetPosition
  }, 900, 'swing')
}

// update highlighted alphabet bar letters
$(window).scroll(function (e) {
  // iterate through groups checking for visibility
  $('.companygroup').each(function (index) {
    // jQuery visible plugin doesn't work if element bigger than viewport so also check if upper
    // and lower bounds are outside viewport
    if ($(this).visible(true) || ($(this).offset().top < window.scrollY && ($(this).offset().top + $(this).height()) > (window.scrollY + window.innerHeight))) {
      $('#' + $(this).data('lettergroupid')).css({backgroundColor: '#FFFFFF', color: '#003263'})
    } else {
      $('#' + $(this).data('lettergroupid')).css({backgroundColor: '#003263', color: '#FFFFFF'})
    }
  })
})
