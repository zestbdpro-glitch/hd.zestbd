import { createElement as createIcon, Play } from 'lucide';
import { trackEvent } from './api.js';

export function initGallery(media) {
  const stage = document.querySelector('[data-gallery-stage]');
  const thumbs = document.querySelector('[data-gallery-thumbs]');
  if (!stage || !thumbs || !Array.isArray(media) || media.length === 0) return;

  let selectedIndex = 0;

  const render = () => {
    const item = media[selectedIndex];
    stage.replaceChildren(renderStageItem(item));
    thumbs.replaceChildren(...media.map((entry, index) => renderThumb(entry, index, index === selectedIndex)));
  };

  const select = (index) => {
    selectedIndex = index;
    trackEvent('select_product_media', { mediaId: media[index].id, mediaType: media[index].type });
    render();
  };

  const renderThumb = (item, index, selected) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.setAttribute('aria-label', item.label || (item.type === 'video' ? 'পণ্যের ভিডিও দেখুন' : `${new Intl.NumberFormat('bn-BD').format(index + 1)} নম্বর ছবি দেখুন`));
    button.setAttribute('aria-selected', String(selected));
    button.addEventListener('click', () => select(index));

    const image = document.createElement('img');
    image.src = item.thumb || (item.type === 'video' ? item.poster : item.src);
    image.alt = '';
    image.width = 240;
    image.height = 240;
    image.loading = 'lazy';
    button.append(image);

    if (item.type === 'video') {
      const playDot = document.createElement('span');
      playDot.className = 'play-dot';
      playDot.setAttribute('aria-hidden', 'true');
      playDot.append(createIcon(Play, { width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' }));
      button.title = item.label || 'পণ্যের ভিডিও দেখুন';
      button.append(playDot);
    }

    return button;
  };

  render();
}

function renderStageItem(item) {
  if (item.type === 'video') {
    return renderVideoPoster(item);
  }

  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.srcset = item.src;
  if (/\.webp(?:[?#]|$)/i.test(item.src)) source.type = 'image/webp';
  const image = document.createElement('img');
  image.src = item.fallback || item.src;
  image.alt = item.alt || 'পণ্যের ছবি';
  image.width = item.width;
  image.height = item.height;
  image.loading = 'eager';
  image.decoding = 'async';
  picture.append(source, image);
  return picture;
}

function renderVideoPoster(item) {
  const shell = document.createElement('div');
  shell.className = 'video-shell';

  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.srcset = item.poster;
  if (/\.webp(?:[?#]|$)/i.test(item.poster)) source.type = 'image/webp';
  const image = document.createElement('img');
  image.src = item.posterFallback || item.poster;
  image.alt = item.alt || 'পণ্যের ভিডিওর ছবি';
  image.width = item.width;
  image.height = item.height;
  image.loading = 'eager';
  picture.append(source, image);

  const button = document.createElement('button');
  button.className = 'video-play';
  button.type = 'button';
  button.setAttribute('aria-label', 'পণ্যের ভিডিও চালু করুন');
  button.title = 'পণ্যের ভিডিও চালু করুন';
  const symbol = document.createElement('span');
  symbol.setAttribute('aria-hidden', 'true');
  symbol.append(createIcon(Play, { width: 28, height: 28, 'aria-hidden': 'true', focusable: 'false' }));
  button.append(symbol);
  button.addEventListener('click', () => {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', 'পণ্যের ভিডিও');
    video.poster = item.posterFallback || item.poster;
    video.width = item.width;
    video.height = item.height;

    const sourceEl = document.createElement('source');
    sourceEl.src = item.src;
    sourceEl.type = 'video/mp4';
    video.append(sourceEl);
    shell.replaceChildren(video);
    video.focus();
    trackEvent('select_product_media', { mediaId: item.id, mediaType: 'video_play' });
  });

  shell.append(picture, button);
  return shell;
}
