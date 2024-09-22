console.log(`
  __                          __ 
_____/ /____  ______  ____  _____/ /_
/ ___/ //_/ / / / __ \\/ __ \\/ ___/ __/
(__  ) ,< / /_/ / /_/ / /_/ / /  / /_  
/____/_/|_|\\__, / .___/\\____/_/   \\__/  
   /____/_/                  /   
         /   


https://github.com/skyportlabs
https://skyport.dev


(c) 2024 Matt James and contributors.
`);

const searchModal = document.getElementById('searchModal');
const modalContent = document.querySelector('.modal-content');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks = document.querySelectorAll('.nav-link');
let selected = '';

function filterLinks(searchTerm) {
  // Split the search term into mainTerm and subTerm
  const [mainTerm, subTerm] = searchTerm.split(':/');
  
  // Ensure mainTerm and subTerm are lowercase for comparison
  const mainTermFiltered = mainTerm ? mainTerm.toLowerCase() : '';
  const subTermFiltered = subTerm ? subTerm.toLowerCase() : '';

  // Filter links based on mainTerm and optionally subTerm
  const filteredLinks = Array.from(navLinks).filter((link) => {
    const textContent = link.textContent.toLowerCase();
    const searchData = link.getAttribute('searchdata')?.toLowerCase();
    const linkSubTerm = link.getAttribute('subterm')?.toLowerCase();

    // Check if main term matches
    const mainTermMatch = textContent.includes(mainTermFiltered) || (searchData && searchData.includes(mainTermFiltered));

    // If subTerm exists, check if it matches too
    const subTermMatch = subTermFiltered
      ? textContent.includes(subTermFiltered) || (searchData && searchData.includes(subTermFiltered)) || (linkSubTerm && linkSubTerm.includes(subTermFiltered))
      : true;

    return mainTermMatch && subTermMatch;
  });

  searchResults.innerHTML = '';

  if (filteredLinks.length === 0) {
    const noResultsMessage = document.createElement('p');
    noResultsMessage.textContent = 'No results found.';
    noResultsMessage.classList.add('text-gray-400', 'text-sm', 'mt-4');
    searchResults.appendChild(noResultsMessage);
  } else {
    filteredLinks.forEach((link, index) => {
      const resultLink = document.createElement('a');
      resultLink.href = link.href;
      resultLink.textContent = link.textContent;
      resultLink.classList.add(
        'nav-link',
        'transition',
        'text-gray-600',
        'hover:bg-gray-200',
        'backdrop-blur',
        'hover:text-gray-800',
        'group',
        'flex',
        'items-center',
        'px-4',
        'py-2',
        'text-sm',
        'font-medium',
        'rounded-xl',
      );

      if (index === 0) {
        selected = resultLink.href;
        resultLink.classList.add('bg-gray-200', 'text-gray-900', 'font-semibold', 'searchLinkActive', 'mt-4');
      }

      searchResults.appendChild(resultLink);
    });
  }
}

filterLinks('');
document.addEventListener('keydown', function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault(); // Prevent default browser action (like search)
    showSearchResults()
  }
});

window.addEventListener('click', (event) => {
  if (event.target === searchModal) {
    modalContent.classList.remove('visible');
    setTimeout(() => {
      searchModal.classList.remove('show');
    }, 300);
  }
});

searchInput.addEventListener('input', () => {
  const searchTerm = searchInput.value.toLowerCase();
  filterLinks(searchTerm);
});

searchInput.addEventListener("keypress", function(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const selectedLink = searchResults.querySelector('.searchLinkActive');
    if (selectedLink) {
      selectedLink.click();
    }
  }
});