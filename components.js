class SiteNav extends HTMLElement {
  connectedCallback() {
    const path = window.location.pathname;
    const isHome = path.endsWith('index.html') || path.endsWith('/');
    const isResume = path.endsWith('resume.html');
    const isWriting = !isHome && !isResume;

    this.innerHTML = `
      <nav>
        <canvas class="nav-mark" aria-hidden="true"></canvas>
        <div class="container">
          <a href="index.html" class="name brand">nojus liutikas</a>
          <div class="links nav-links">
            <a href="index.html#projects">projects</a>
            <a href="index.html#blog" ${isWriting ? 'class="active"' : ''}>writing</a>
            <a href="resume.html" ${isResume ? 'class="active"' : ''}>resume</a>
            <a href="index.html#contact">contact</a>
          </div>
        </div>
      </nav>
    `;
  }
}

class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer>
        <p>built with Workpath</p>
      </footer>
    `;
  }
}

customElements.define('site-nav', SiteNav);
customElements.define('site-footer', SiteFooter);
