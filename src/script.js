// 'composite' is the video stream merging all videos together, and is used for pip
composite = new VideoStreamMerger()
compositeVideos = []
idCounter = new Date().getTime()
compositeDomID = 'multipip_extension_video'

function getId(node) {
    return (node.id) ? node.id : (node.id = 'vidID_' + idCounter++);
}

function getCompositeDom() {
    // Get dom playing composite video, create if not existing
    return document.getElementById(compositeDomID) || createCompositeVideoElement()
}

function findAllPlayingVideos() {
    return Array.from(document.querySelectorAll('video'))
        .filter(video => video.readyState !== 0)
        .filter(video => video.disablePictureInPicture === false)
        .filter(video => video.getAttribute('id') !== compositeDomID)
        .sort((v1, v2) => {
            const v1Rect = v1.getClientRects()[0] || {width: 0, height: 0};
            const v2Rect = v2.getClientRects()[0] || {width: 0, height: 0};
            return ((v2Rect.width * v2Rect.height) - (v1Rect.width * v1Rect.height));
        });
}

async function requestPictureInPicture() {
    const video = getCompositeDom()
    await video.requestPictureInPicture();
    video.setAttribute('__pip__', true);
    video.addEventListener('leavepictureinpicture', event => {
        leavePictureInPicture()
    }, {once: true});
    updateCompositeVideoStream({forced: true, recurring: true})
}

function leavePictureInPicture() {
    if (isPipActive()) {
        document.exitPictureInPicture()
    }
    getCompositeDom().removeAttribute('__pip__');
    composite.destroy()
}

function createCompositeVideoElement() {
    const s = document.createElement('video');
    s.setAttribute('id', compositeDomID);
    s.setAttribute('muted', '');
    s.setAttribute('controls', '');
    s.setAttribute('autoplay', '');
    s.setAttribute('playsinline', 'playsinline');
    s.setAttribute('webkit-playsinline', '');
    document.getElementsByTagName('body')[0].appendChild(s);
    return s
}

function updateCompositeVideoStream(options = {forced: false, recurring: true}) {
    if (!options.forced && !isPipActive()) {
        return
    }

    if (composite) {
        compositeVideos.forEach(function (vid) {
            composite.removeStream(vid.id)
        })
        compositeVideos = []
    }

    const videos = findAllPlayingVideos()
    if (!options.forced && videos.length === 0) {
        leavePictureInPicture()
        return
    }

    // Find height of composite video and total height to compute scale factor
    const compositeHeight = Math.min(300 * videos.length, 1500)
    const totalHeight = videos.reduce(function (accumulator, vid) {
        return accumulator + (vid.getClientRects()[0] || {height: 0}).height;
    }, 0)

    // Find maximum width after rescaling
    const scale = compositeHeight / totalHeight
    const maxWidth = Math.max(...videos.map((vid) => scale * (vid.getClientRects()[0] || {width: 0}).width))
    composite.setOutputSize(maxWidth, compositeHeight)

    // Stack videos vertically
    let yFilled = 0
    for (let i = 0; i < videos.length; i++) {
        const vRect = videos[i].getClientRects()[0] || {width: 0, height: 0};
        const scaledWidth = scale * vRect.width
        const scaledHeight = scale * vRect.height
        let id = getId(videos[i])
        compositeVideos.push({'id': id})
        composite.addMediaElement(id, videos[i], {
            x: (maxWidth - scaledWidth) * 0.5,
            y: yFilled,
            width: scaledWidth,
            height: scaledHeight,
            index: i,
            mute: true
        })
        yFilled += scaledHeight
    }
    composite.start()
    getCompositeDom().srcObject = composite.result;

    if (options.recurring) {
        window.setTimeout(updateCompositeVideoStream, 500)
    }
}

function isPipActive() {
    return document.pictureInPictureElement !== null
}


(async () => {
    if (isPipActive()) {
        leavePictureInPicture()
        return
    }

    // Create dom containing composite video
    const s = getCompositeDom()
    // Setup composite video
    updateCompositeVideoStream({forced: true, recurring: false})
    // Request pip once metadata is loaded
    s.addEventListener('loadedmetadata', event => {
        // Start recurring update of composite video
        requestPictureInPicture()
    }, {once: true});
})();
