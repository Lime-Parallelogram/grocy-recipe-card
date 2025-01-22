const LitElement = customElements.get("hui-masonry-view")
    ? Object.getPrototypeOf(customElements.get("hui-masonry-view"))
    : Object.getPrototypeOf(customElements.get("hui-view"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

window.customCards = window.customCards || [];
window.customCards.push({
    type: "grocy-ingredients-card",
    name: "Ingredients Card",
    description: "A card to the ingredients required for the current meal plan recipe.",
    preview: false,
});

const fireEvent = (node, type, detail, options) => {
    options = options || {};
    detail = detail === null || detail === undefined ? {} : detail;
    const event = new Event(type, {
        bubbles: options.bubbles === undefined ? true : options.bubbles,
        cancelable: Boolean(options.cancelable),
        composed: options.composed === undefined ? true : options.composed,
    });
    event.detail = detail;
    node.dispatchEvent(event);
    return event;
};

class IngredientsCard extends LitElement {

    lastMP = null; // Used to keep track of when meal plan changes
    recipePos = []; // Used to store the recipePos as retrieved from server
    allProducts = [];
    allQUs = [];

    static get properties() {
        return {
            _config: {
                displayRows: 2
            },
            hass: {},
        };
    }

    setConfig(config) {
        if (!config.entity) {
            throw new Error("Please select the meal plan sensor");
        }

        if (!config.grocyAPIKey) {
            throw new Error("Please set your grocyAPIKey");
        }

        this._config = config;
    }

    translate(string) {
        if ((this._config.custom_translation != null) &&
            (this._config.custom_translation[string] != null)) {
            return this._config.custom_translation[string];
        }
        return string;
    }

    render() {
        if (!this._config || !this.hass) {
            return html``;
        }

        this.numberElements = 0;
        this.recipelength = 300;
        if (this._config.recipeLength != null) {
            this.recipelength = this._config.recipeLength;
        }
        const stateObj = this.hass.states[this._config.entity];

        if (!stateObj) {
            return html`
            <style>
              .not-found {
                flex: 1;
                background-color: yellow;
                padding: 8px;
              }
            </style>
            <ha-card>
              <div class="not-found">
                Entity not available: ${this._config.entity}
              </div>
            </ha-card>
          `;
        }

        var lastrender = new Date();
        
        if (stateObj != this.lastMP) {
            console.log("The meal plan was updated");
            const requestOptions = {
                method: "GET",
                headers: {
                    "GROCY-API-KEY": this._config.grocyAPIKey
                }
            }

            fetch("https://grocy.limeparallelogram.uk/api/objects/recipes_pos", requestOptions)
            .then(response => {
               return response.json();
            })
            .then(data => this.recipePos = data)

            // Request list of products
            fetch("https://grocy.limeparallelogram.uk/api/objects/products", requestOptions)
            .then(response => {
               return response.json();
            })
            .then(data => this.allProducts = data)

            // Request list of all quantity units
            fetch("https://grocy.limeparallelogram.uk/api/objects/quantity_units", requestOptions)
            .then(response => {
               return response.json();
            })
            .then(data => this.allQUs = data)

            this.lastMP = stateObj;
        }

        var next_meal = stateObj.attributes.meals[0]
        var recipe_ingredients = this.recipePos.filter(value => {return value.recipe_id == next_meal.recipe_id})

        var sections = [];

        var ingredients_readable = recipe_ingredients.map(initial => {
            if (initial.ingredient_group != null) {
                sections.push(initial.ingredient_group);
            }

            return {
                id: initial.product_id,
                name: this.allProducts.find(product => product.id == initial.product_id).name,
                amount: initial.amount.toString() + this.allQUs.find(unit => unit.id == initial.qu_id).name,
                section: initial.ingredient_group
            }
        })

        sections.push(null) // Ensure un-grouped ingredients are last

        var ingredients_by_section = {};
        if (sections.length == 0) {
            ingredients_by_section = {
                Ingredients: ingredients_readable
            }
        } else {
            sections.forEach(sectionName => {
                ingredients_by_section[sectionName] = ingredients_readable.filter(ingredient => { return ingredient.section == sectionName} )
            })
        }
        
        return html`
          <ha-card @click="${this._handleClick}">
            ${this.renderList(ingredients_by_section, 1)}
          </ha-card>
        `;
    }

    renderList(ingredients, rows) {
        console.log(ingredients)
        var newDiv = document.createElement("div");

        for (let [sectionName, sectionIngredients] of Object.entries(ingredients)) {
            let sectionTitle = document.createElement("div")
            sectionTitle.classList.add("section-title")

            if (sectionName != "null") {
                sectionTitle.innerText = sectionName;  
            } else {
                sectionTitle.innerText = "BASE"
            }

            newDiv.appendChild(sectionTitle);
            

            let ingredientContainer = document.createElement("div")
            ingredientContainer.classList.add("ingredients-container")

            sectionIngredients.forEach(element => {
                let ingredientEntry = document.createElement("div")
                ingredientEntry.classList.add("ingredient-entry");
                ingredientEntry.style.flex = `${100/this._config.displayRows}%`
                ingredientEntry.style.maxWidth = `${100/this._config.displayRows}%`
                
                ingredientEntry.innerHTML += `<div class="ingredient-bullet"></div> <div class="ingredient-name">${element.name}</div> <div class="ingredient-amount">${element.amount}</div>`
                
                ingredientContainer.appendChild(ingredientEntry);
            });

            newDiv.appendChild(ingredientContainer);
        }

        return newDiv;
    }

    _handleClick() {
        fireEvent(this, "hass-more-info", { entityId: this._config.entity });
    }

    getCardSize() {
        return 3;
    }

    static get styles() {
        return css`
          ha-card {
            cursor: pointer;
            margin: auto;
            padding-top: 1.3em;
            padding-bottom: 1.3em;
            padding-left: 1em;
            padding-right: 1em;
            position: relative;
          }

          .ingredients-container {
            display: flex;
            flex-wrap: wrap;
          }
            
          .ingredient-entry {
            padding: 0;
            display: flex;
            align-items: center;
          }

          .ingredient-bullet {
            width: 10px;
            height: 10px;
            border: 2px solid grey;
            border-radius: 50%;
            margin-left: 20px;
          }
        
          .ingredient-name {
            flex-grow: 1;
            text-align: left;
            padding: 4px;
          }

          .section-title {
            font-weight: bold;
            text-align: left;
          }
        `;
    }
}
customElements.define("grocy-ingredients-card", IngredientsCard);
