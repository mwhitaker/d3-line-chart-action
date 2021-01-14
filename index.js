const core = require("@actions/core");
const github = require("@actions/github");
const d3 = require("d3");
const fs = require("fs");

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const dom = new JSDOM(`<!DOCTYPE html><body></body>`);
let body = d3.select(dom.window.document.querySelector("body"))

const margin = { top: parseInt(core.getInput("top-margin")), right: parseInt(core.getInput("right-margin")), bottom: parseInt(core.getInput("bottom-margin")), left: parseInt(core.getInput("left-margin")) },
    width = parseInt(core.getInput("width")) - margin.left - margin.right,
    height = parseInt(core.getInput("height")) - margin.top - margin.bottom

let svg = body
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr('xmlns', 'http://www.w3.org/2000/svg')
    .style("opacity", 1.0)
    .style("fill", "white")
    .append("g")
    .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

async function run() {
    try {
        const output = {}
        const csvFile = core.getInput("csv-file");
        core.info(`Using csv file: ${csvFile}`);
        const outputFile = core.getInput("output-file");
        core.info(`Wrting chart to: ${outputFile}`);
        const lineStyle = core.getInput("line-style");
        const dateColumn = core.getInput("date-column");
        core.info(`Date column: ${dateColumn}`);
        const valueColumn = core.getInput("value-column");
        core.info(`Value column: ${valueColumn}`);
        const rrr = fs.readFileSync(csvFile, 'utf-8');
        const res = d3.csvParse(rrr, d => ({
            date: new Date(d[dateColumn]),
            value: +d[valueColumn],
        }));
        core.info(`Number of rows: ${res.length}`);
        const lastRecord = res[res.length - 1]
        core.info(`Last value: ${lastRecord.value}`);
        const timeformat = d3.timeFormat("%m/%d - %I %p");
        const x = d3.scaleTime()
            .domain(d3.extent(res, function (d) { return d.date; }))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(res, function (d) { return +d.value; })])
            .range([height, 0]);

        const sortedCounts = res.map(re => re.value).filter(d => d !== null && !isNaN(d)).sort(d3.ascending);
        const min = sortedCounts[0];
        const max = sortedCounts[sortedCounts.length - 1];
        const q1 = d3.quantileSorted(sortedCounts, 0.25);
        const q2 = d3.quantileSorted(sortedCounts, 0.50);
        const q3 = d3.quantileSorted(sortedCounts, 0.75);
        const iqr = q3 - q1; // interquartile range
        const r0 = Math.max(min, q1 - iqr * 1.5);
        core.info(`Lower bound r0: ${r0}`);
        const r1 = Math.min(max, q3 + iqr * 1.5);
        core.info(`Upper bound r1: ${r1}`);
        output.data = res
        output.quartiles = [q1, q2, q3];
        output.range = [r0, r1];
        output.outliers = (lastRecord.value < r0 || lastRecord.value > r1) ? [lastRecord.value] : []; 

        const bottomA = svg.append("g")
            .attr("transform", "translate(0," + height + ")")
        bottomA.call(d3.axisBottom(x).tickFormat(timeformat)).selectAll("line,path").style("stroke", "black")
        bottomA.selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-2.0em")
            .attr("dy", "0em")
            .attr("transform", "rotate(-65)"); 
        svg.append("g")
            .attr("class", "y axis")
            .call(d3.axisLeft(y)).selectAll("line,path").style("stroke", "black"); 

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", "-4.0em")
            .attr("dy", "-0.1em")
            .attr("text-anchor", "end")
            .attr("stroke", "black")
            .text(valueColumn);
        // svg.append("text")
        //      .attr("y", height + 50)
        //      .attr("x", width)
        //     //  .attr("dx", "-2.0em")
        //     //  .attr("dy", "0em")
        //      .attr("text-anchor", "end")
        //      .attr("stroke", "black")
        //      .text("Year");
        svg.append("path")
            .datum(res)  
            .attr("style", lineStyle)  
            .attr("d", d3.line()
                .x(function (d) { return x(d.date) })
                .y(function (d) { return y(d.value) })
                .curve(d3.curveMonotoneX)
            );
        fs.writeFileSync(outputFile, body.html());
        core.info(`Outliers found: ${output.outliers.length > 0}`);
        core.setOutput("summary-alert", output.outliers.length > 0)
        core.setOutput("summary-stats", output)
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();