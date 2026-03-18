class SiteNav extends HTMLElement {
  connectedCallback() {
    const path = window.location.pathname;
    const isResume = path.endsWith('resume.html');
    const isWriting = !path.endsWith('index.html') && !path.endsWith('/') && !isResume;

    this.innerHTML = `
      <nav>
        <div class="container">
          <a href="index.html" class="name">nojus liutikas</a>
          <div class="links">
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
        <p>built with no framework, as intended</p>
      </footer>
    `;
  }
}

customElements.define('site-nav', SiteNav);
customElements.define('site-footer', SiteFooter);
