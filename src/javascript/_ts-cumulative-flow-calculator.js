Ext.define("CumulativeFlowCalculator", {
     extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
     config: {
         stateFieldName: 'ScheduleState',
         stateFieldValues: ['Defined', 'In-Progress', 'Completed', 'Accepted', 'Finished']
     },
     runCalculation: function (snapshots) {
         var calculatorConfig = this._prepareCalculatorConfig(),
             seriesConfig = this._buildSeriesConfig(calculatorConfig);

         var calculator = this.prepareCalculator(calculatorConfig);
         calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));
         
         var calcs = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);

         //Make the series stacked 
//         Ext.each(calcs.series, function(s){
//             console.log(s);
//             if (Ext.Array.contains(this.getStateFieldValues(),s['name'])){
//                 //Only stack if this is a state.  Do not stack other lines
//                 s['stack'] = 1;
//             }
//         },this);

         var actual_series = this._getActualSeries(calcs);
         calcs.series.push(actual_series);
         console.log(calcs);
         //Format the categories by week 
         var new_categories = _.map(calcs.categories, function(c){
             var week = Rally.util.DateTime.format(new Date(c), 'W');
             return 'WW' + week.toString(); 
         });
         calcs.categories = new_categories;
         return calcs;
     },
     _getActualSeries: function(calcs){

         var data = [];
         var num_velocity_periods = Rally.util.DateTime.getDifference(new Date(calcs.categories[calcs.categories.length-1]), new Date(calcs.categories[0]),'week')/2;
         console.log('weeks',num_velocity_periods);
         var velocity = 0;
         
         var firstAcceptedi = 0;
         Ext.each(calcs.series, function(s){
             if (s.name == 'Accepted'){
                 for (var i=0; i<s.data.length; i++){
                     if (data[i] > 0){
                         firstAcceptedi = i;
                     }
                     data[i] = null;
                 }
                 data[firstAcceptedi] = 0;
                 data[s.data.length-1] = s.data[s.data.length-1]
                 velocity = Math.round(data[s.data.length-1]/num_velocity_periods * 100)/100;  
             }
         });

         var series = {
                 name: Ext.String.format('Actual (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '',
                 dashStyle: 'Solid'
         };
         return series;
     },
     constructor: function(config) {
         this.initConfig(config);
         this.callParent(arguments);
     },
     getMetrics: function() {
         var metrics = [];
         Ext.each(this.getStateFieldValues(), function(stateFieldValue){
             metrics.push({
                 field: 'PlanEstimate',
                 as: stateFieldValue,
                 f: 'filteredSum',
                 filterField: this.getStateFieldName(),
                 filterValues: [stateFieldValue],
                 display: 'area'
             });  
         }, this);
         
         metrics.push({
             field: 'PlanEstimate',
             as: 'TotalPoints',
             f: 'sum',
             display: 'line'
         })

         return metrics; 
         
     },
     getDerivedFieldsOnInput: function(){
         return [];
     },
     getDerivedFieldsAfterSummary: function(){
         return [];
     }


 });