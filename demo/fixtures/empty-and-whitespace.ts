// Edge cases: empty lines, whitespace-only lines, trailing whitespace

export function sparse() {

  const a = 1;


  const b = 2;



  const c = 3;




  // Four blank lines above, three above that, two above that, one above that
  return a + b + c;
}

// Trailing whitespace (spaces after content):
export const withTrailing = "value";
export const moreTrailing = "value";

// Tab-indented code (mixed with spaces):
	function _tabIndented() {
		const x = 1;
		if (x) {
				return x; // extra indent
		}
	}

// Line with only spaces (4, 8, 12):




// Carriage return edge case (this file should be LF only, but test the visual):
export const cr = "no carriage returns here";

// Unicode whitespace:
export const emSpace = "before\u2003after"; // em space
export const thinSpace = "before\u2009after"; // thin space
