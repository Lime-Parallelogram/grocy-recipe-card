// Updated to match HASS Custom Card Documentation
import {
    LitElement,
    html,
    css,
  } from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

window.customCards = window.customCards || [];
window.customCards.push({
    type: "grocy-ingredients-card",
    name: "Ingredients Card",
    description: "A card to the ingredients required for the current meal plan recipe.",
    configurable: true,
    preview: true,
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
    quConversions = [];

    // Holds the next meal plan entry (whose data is displayed on the card)
    nextMeal = null;

    static get properties() {
        return {
            _config: {},
            hass: {},
        };
    }


    // ─── Configuration Options ───────────────────────────────────────────

    setConfig(config) {
        if (!config.entity) {
            throw new Error("Please select the meal plan sensor");
        }

        if (!config.grocyURL) {
            throw new Error("No Grocy URL specified")
        }

        if (!config.grocyAPIKey) {
            throw new Error("Please set the API Key");
        }

        this._config = config;
    }

    // Returns default configuration options
    static getStubConfig() {
        return {
            entity: "sensor.grocy_meal_plan",
            displayRows: 3,
            grocyURL: null,
            grocyAPIKey: null,
         }
    }

    // How many rows does the card take up in grid view
    getCardSize() {
        return 3;
    }

    // Clicking on the card just brings up meal plan entity
    _handleClick() {
        fireEvent(this, "hass-more-info", { entityId: this._config.entity });
    }


    // ─── Grocy Recipes Functionality ─────────────────────────────────────

    // Request updated data from Grocy server.
    // Updates: recipePos, allProducts, allQUs
    _updateGrocyData() {
        const requestOptions = {
            method: "GET",
            headers: {
                "GROCY-API-KEY": this._config.grocyAPIKey
            }
        }

        const baseUrl = this._config.grocyURL;

        return new Promise(resolve => {
            let requestsComplete = 0;
            function requestComplete() {
                requestsComplete ++;
                
                if (requestsComplete == 4) {
                    resolve(true)
                }
            }

            // The recipe products act as a bridge between 
            fetch(new URL("/api/objects/recipes_pos", baseUrl), requestOptions)
            .then(response => { return response.json(); })
            .then(data => this.recipePos = data)
            .then(requestComplete)

            // Request list of products
            fetch(new URL("/api/objects/products", baseUrl), requestOptions)
            .then(response => { return response.json(); })
            .then(data => this.allProducts = data)
            .then(requestComplete)

            // Request list of all quantity units
            fetch(new URL("/api/objects/quantity_units", baseUrl), requestOptions)
            .then(response => { return response.json(); })
            .then(data => this.allQUs = data)
            .then(requestComplete)

            // Request list of all unit conversions
            fetch(new URL("/api/objects/quantity_unit_conversions", baseUrl), requestOptions)
            .then(response => { return response.json(); })
            .then(data => this.quConversions = data)
            .then(requestComplete)
        });

    }

    /* Generates a list of ingredients required and outputs via a dictionary
     * Format:
     * {
     *   <sectionName>: [
     *     {
     *       name: string
     *       amount: string
     *       section: string
     *       note: string
     *     }
     *   ]
     * }
     */
    _generateIngredientsList(recipeID, recipeServings) {
        var recipe_ingredients = this.recipePos.filter(value => {return value.recipe_id == recipeID})

        var ingredientsList = {};

        recipe_ingredients.forEach(ingredient => {
            if (ingredientsList[ingredient.ingredient_group] == null) {
                ingredientsList[ingredient.ingredient_group] = []
            }

            let product = this.allProducts.find(product => product.id == ingredient.product_id)

            // Amount is always stored in the product's stock amount so may need to convert
            let multiplier = 1;
            if (product.qu_id_stock != ingredient.qu_id && !ingredient.only_check_single_unit_in_stock) {
                multiplier = this.quConversions.find(conversion => (conversion.from_qu_id == product.qu_id_stock &&
                                                     conversion.to_qu_id == ingredient.qu_id)).factor;
            }

            let amountText = (ingredient.amount * multiplier).toString() + this.allQUs.find(unit => unit.id == ingredient.qu_id).name;
            if (ingredient.variable_amount != null) {
                // I feel arguably it makes sense not to show the qu_name but show it to be consistent
                amountText = ingredient.variable_amount + " " +
                             this.allQUs.find(unit => unit.id == ingredient.qu_id).name;
            }


            ingredientsList[ingredient.ingredient_group].push(
            {
                name: product.name,
                amount: amountText,
                section: ingredient.ingredient_group,
                note: ingredient.note
            });
        });

        return ingredientsList;
    }


    // ─── Card Rendering ──────────────────────────────────────────────────

    render() {
        if (!this._config || !this.hass) {
            return html``;
        }

        let stateObject = this.hass.states[this._config.entity];

        // Error handling if grocy sensor becomes unavailable.
        if (!stateObject) {
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

        // We only display the recipe for the next meals
        this.nextMeal = stateObject.attributes.meals[0];
        
        let cardContent = document.createElement("div");
        cardContent.innerText = "Loading ..."
        
        // Only make the additional requests to Grocy if the HA meal plan object has changed
        if (this.nextMeal != this.lastMP) {
            this.lastMP = this.nextMeal;
            this._updateGrocyData().then(success => {
                console.log("Updating from grocy succeeded: " + success)
                cardContent.replaceChildren(this._renderCardContent());
            });
        } else {
            cardContent.replaceChildren(this._renderCardContent());
        }
        
        return html`
        <ha-card @click="${this._handleClick}">
          ${cardContent}
        </ha-card>
        `;
    }

    /*
     * Get complete card content. Separated from main render() method so can be
     * called additionally when the grocy requests are complete
     */
    _renderCardContent() {
        return this._renderIngredientsList(this.nextMeal.recipe_id, 1)
    }


    /*
     * Render a box showing ingredients for specified recipeID
     */
    _renderIngredientsList(recipeID, recipeServings) {
        var newDiv = document.createElement("div");

        let ingredients = this._generateIngredientsList(recipeID, recipeServings);

        for (let [sectionName, sectionIngredients] of Object.entries(ingredients)) {
            let sectionTitle = document.createElement("div")
            sectionTitle.classList.add("section-title")

            if (sectionName != "null") {
                sectionTitle.innerText = sectionName;  
            } else if (Object.keys(ingredients).length == 0 ) {  // There are no sections
                sectionTitle.innerText = "INGREDIENTS"
            } else { // Some ingredients not assigned a section
                sectionTitle.innerText = "BASE"
            }

            newDiv.appendChild(sectionTitle);
            

            let ingredientContainer = document.createElement("div")
            ingredientContainer.classList.add("ingredients-container")

            sectionIngredients.forEach(element => {
                let ingredientEntry = document.createElement("div")
                ingredientEntry.classList.add("ingredient-entry");

                // Styling defined here so can be dynamic based on config
                ingredientEntry.style.flex = `${100/this._config.displayRows}%`
                ingredientEntry.style.maxWidth = `${100/this._config.displayRows}%`

                let noteElement = "";
                if (element.note) {
                    noteElement = `<span class="ingredient-note">${element.note}</span>`
                }
                
                ingredientEntry.innerHTML += `<div class="ingredient-bullet"></div> <div class="ingredient-name">${element.name} ${noteElement}</div> <div class="ingredient-amount">${element.amount}</div>`
                
                ingredientContainer.appendChild(ingredientEntry);
            });

            newDiv.appendChild(ingredientContainer);
        }

        return newDiv;
    }


    // ─── CSS Styling ─────────────────────────────────────────────────────

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
            align-items: flex-start;
          }

          .ingredient-bullet {
            width: 10px;
            height: 10px;
            border: 2px solid grey;
            border-radius: 50%;
            margin-left: 20px;
            margin-top: 0.5em;
          }
        
          .ingredient-name {
            flex-grow: 1;
            text-align: left;
            padding: 4px;
          }

          .ingredient-note {
            font-size: 0.8em;
            opacity: 0.7;
          }

          .section-title {
            font-weight: bold;
            text-align: left;
          }
        `;
    }
}
customElements.define("grocy-ingredients-card", IngredientsCard);
