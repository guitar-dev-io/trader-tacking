// About box on the mobile More page (the settings window renders <About/> itself).
import { mount } from 'svelte';
import { def } from '../../pt';
import About from './About.svelte';
import { SUPPORT } from './support';

function mountMore() {
  const more = document.querySelector('#tab-more .m-more');
  if (!more || more.querySelector('.about-dev')) return;
  const host = document.createElement('div'); host.style.display = 'contents';
  const ver = more.querySelector('.m-ver'); (ver || more.lastElementChild)!.before(host);
  mount(About, { target: host });
}
mountMore(); setTimeout(mountMore, 1500);           // the mobile More page is built by mobile.js
def({ SUPPORT: [() => SUPPORT] });
